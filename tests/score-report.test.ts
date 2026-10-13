/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import maps from "../src/panels/library/label-maps.json";
import { drawWeights } from "../src/panels/lab/scorecard/bootstrap";
import {
  cellsOf,
  toJson,
  toMarkdown,
} from "../src/panels/lab/scorecard/score-markdown";
import { cocoId, prepare } from "../src/panels/lab/scorecard/score-prepare";
import { buildReport } from "../src/panels/lab/scorecard/score-report";
import type { RunRaw, RunResult } from "../src/panels/lab/scorecard/score-run";
import type { ScoreSet, SetItem } from "../src/panels/lab/scorecard/score-set";
import { SET_BYTES } from "../src/panels/lab/scorecard/score-set";
import {
  basisLines,
  caption,
  comparison,
  itemLine,
  intro,
} from "../src/panels/lab/scorecard/score-wording";
import { targetsFor } from "../src/panels/lab/scorecard/score-worker";

// A made-up set: every picture holds `per` cups in a row. A run finds the
// first `finds` of them exactly and adds one box where nothing is labelled.
const cup = (n: number) => ({ x: n * 20, y: 10, w: 10, h: 10 });
function setOf(pictures: number, per: number): ScoreSet {
  const items = Array.from({ length: pictures }, (_, i) => ({
    id: i + 1,
    file: `${i + 1}.jpg`,
    width: 640,
    height: 480,
    checked: "2026-10-12",
    boxes: Array.from({ length: per }, (_, n) => ({
      label: "cup",
      crowd: false,
      ...cup(n),
    })),
  })) as unknown as SetItem[];
  return {
    id: "test-set",
    source: "COCO val2017",
    pictures,
    boxes: pictures * per,
    crowds: 0,
    bytes: 16_429_956,
    items,
  } as unknown as ScoreSet;
}
const [target] = targetsFor(["efficientdet_lite0.tflite"], ["CPU"]);
const runOf = (set: ScoreSet, finds: (picture: number) => number): RunRaw => ({
  target,
  status: "ok",
  note: "",
  sha256: "aa",
  pictures: set.items.map((_, i) => ({
    latency: 10 + i,
    boxes: [
      ...Array.from({ length: finds(i) }, (_, n) => ({
        label: "cup",
        score: 0.9,
        box: cup(n),
      })),
      { label: "vase", score: 0.6, box: { x: 300, y: 300, w: 50, h: 50 } },
    ],
  })),
});
const failed: RunRaw = {
  target: { ...target, id: "gpu", delegate: "GPU" },
  status: "failed",
  note: "no GPU here",
  sha256: null,
  pictures: [],
};
const meta = {
  startedAt: "2026-10-12T00:00:00Z",
  device: {},
  pinned: () => "aa",
};
async function reportOf(result: RunResult, confidence = 0.45) {
  const weights = drawWeights(result.items.length, 200),
    prepared = await prepare(result, weights, async () => {});
  return buildReport(result, prepared, weights, confidence, meta);
}
const whole = (set: ScoreSet, runs: RunRaw[], n = set.items.length) => ({
  set,
  items: set.items.slice(0, n),
  runs,
  stopped: false,
});

describe("the scorecard report", () => {
  it("counts hits, misses and false boxes and states each figure with a range", async () => {
    const set = setOf(30, 2),
      report = await reportOf(whole(set, [runOf(set, (i) => i % 2)]));
    const [run] = report.runs;
    expect(run).toMatchObject({ hits: 15, misses: 45, falses: 30 });
    expect(run.found).toMatchObject({ value: 0.25, basis: "bootstrap" });
    expect(run.right!.value).toBeCloseTo(15 / 45, 12);
    expect(run.matchesCatalogue).toBe(true);
    expect(run.latency).toMatchObject({ pictures: 30, p50: 24.5 });
    expect(cellsOf(run, report)[0]).toMatch(/^25% \(\d+ to \d+\)$/);
    expect(cellsOf(run, report)[2]).toMatch(/^0\.\d\d \(0\.\d\d to 0\.\d\d\)$/);
    expect(cellsOf(run, report)[4]).toBe("25 (p95 38)");
  });
  it("gives no figure under 20 labelled objects, and says how many there were", async () => {
    const set = setOf(9, 2),
      report = await reportOf(whole(set, [runOf(set, () => 2)]));
    expect(report.protocol.labelledObjects).toBe(18);
    expect(report.runs[0]).toMatchObject({
      found: null,
      right: null,
      ap50: null,
      ap: null,
    });
    expect(cellsOf(report.runs[0], report).slice(0, 4)).toEqual(
      Array(4).fill("too few labelled objects (18)"),
    );
    expect(JSON.parse(toJson(report)).runs[0].found).toBeNull();
  });
  it("falls back to Wilson when every resample agrees, and says over how many", async () => {
    const set = setOf(20, 2),
      report = await reportOf(whole(set, [runOf(set, () => 2)]));
    expect(report.runs[0].found).toMatchObject({
      value: 1,
      basis: "wilson",
      over: 40,
    });
    expect(cellsOf(report.runs[0], report)[0]).toBe(
      "100% (91 to 100, Wilson over 40 objects)",
    );
  });
  it("re-scores at another Confidence value without changing AP", async () => {
    const set = setOf(30, 2),
      result = whole(set, [runOf(set, () => 1)]),
      low = await reportOf(result, 0.45),
      high = await reportOf(result, 0.7);
    expect(low.runs[0].falses).toBe(30);
    expect(high.runs[0].falses).toBe(0);
    expect(high.runs[0].ap50).toEqual(low.runs[0].ap50);
  });
  it("shows a failed run as not measured, with its reason, and null in JSON", async () => {
    const set = setOf(30, 2),
      report = await reportOf(whole(set, [failed, runOf(set, () => 1)]));
    expect(cellsOf(report.runs[0], report)).toEqual(
      Array(5).fill("not measured"),
    );
    expect(toMarkdown(report)).toContain("did not run: no GPU here");
    const json = JSON.parse(toJson(report));
    expect(json.runs[0]).toMatchObject({
      status: "failed",
      found: null,
      ap: null,
      latency: null,
    });
    expect(json.kind).toBe("scorecard");
  });
  it("compares each run with the first on the same resamples: a run against itself differs by exactly 0", async () => {
    const set = setOf(30, 2),
      same = runOf(set, (i) => i % 3),
      report = await reportOf(whole(set, [same, same, runOf(set, () => 2)]));
    expect(report.comparisons).toHaveLength(2);
    expect(report.comparisons[0].found).toMatchObject({
      value: 0,
      lo: 0,
      hi: 0,
      verdict: "cannot tell",
    });
    expect(report.comparisons[1].found.verdict).toBe("more");
    expect(toMarkdown(report)).toContain(
      "On found and on AP50 these pictures cannot tell them apart.",
    );
  });
  it("lists by class only classes with 20 labelled objects or more", async () => {
    const set = setOf(30, 2);
    set.items[0].boxes.push({
      label: "bowl",
      crowd: false,
      x: 400,
      y: 10,
      w: 10,
      h: 10,
    });
    const report = await reportOf(whole(set, [runOf(set, () => 1)]));
    expect(report.byClass.map((row) => [row.label, row.labelled])).toEqual([
      ["cup", 60],
    ]);
    expect(report.otherClasses).toBe(1);
    expect(report.protocol.classes).toBe(2);
  });
  it("writes COCO results a reader can re-score: picture id, category id, pixel box", async () => {
    const set = setOf(20, 1),
      report = await reportOf(whole(set, [runOf(set, () => 1)]));
    expect(report.runs[0].cocoResults[0]).toEqual({
      image_id: 1,
      category_id: 47,
      bbox: [0, 10, 10, 10],
      score: 0.9,
    });
    expect(report.runs[0].cocoResults).toHaveLength(40);
  });
});

describe("the exports", () => {
  it("carry the caption and every basis line word for word, and say when a run was shortened", async () => {
    const set = setOf(30, 2),
      full = await reportOf(whole(set, [runOf(set, () => 1)])),
      cut = runOf(set, () => 1),
      short = await reportOf(
        whole(set, [{ ...cut, pictures: cut.pictures.slice(0, 12) }], 12),
      ),
      markdown = toMarkdown(full),
      facts = {
        pictures: 30,
        boxes: 60,
        bytes: 16_429_956,
        checked: "2026-10-12",
      };
    expect(markdown).toContain(caption(30, 60));
    for (const line of basisLines(facts, 0.45, 1))
      expect(markdown).toContain(line);
    expect(markdown).not.toContain("shortened");
    expect(toMarkdown(short)).toContain(
      "(shortened test run: 12 of 30 pictures)",
    );
    expect(JSON.parse(toJson(short)).protocol).toMatchObject({
      shortened: true,
      picturesScored: 12,
    });
    expect(JSON.parse(toJson(full)).protocol.shortened).toBe(false);
  });
});

describe("the wording", () => {
  it("says the download's size before Run, from a constant equal to the set's own total", () => {
    const set = JSON.parse(readFileSync("public/eval/set.json", "utf8"));
    expect(SET_BYTES).toBe(set.bytes);
    expect(intro(null)).toContain("The photographs (16.4 MB) are downloaded");
    expect(intro(null)).not.toContain("100");
    expect(
      intro({ pictures: 100, boxes: 438, bytes: 16_429_956, checked: "" }),
    ).toContain("100 labelled photographs, in this browser");
    expect(
      intro({ pictures: 100, boxes: 438, bytes: 16_429_956, checked: "" }),
    ).toContain("(16.4 MB)");
  });
  it("never calls a gap whose range holds zero more or fewer", () => {
    const d = (
      value: number,
      lo: number,
      hi: number,
      verdict: "more" | "fewer" | "cannot tell",
    ) => ({ value, lo, hi, basis: "bootstrap" as const, skipped: 0, verdict });
    expect(
      comparison(
        "B on GPU",
        "A on CPU",
        d(0.09, 0.02, 0.16, "more"),
        d(0.08, -0.01, 0.17, "cannot tell"),
      ),
    ).toBe(
      "B on GPU against A on CPU: found +9 points (+2 to +16), AP50 +0.080 (-0.010 to +0.170). Found more; on AP50 these pictures cannot tell them apart.",
    );
    // A low end just above zero must not print as zero beside "higher".
    expect(
      comparison(
        "B",
        "A",
        d(0, -0.01, 0.01, "cannot tell"),
        d(0.03596, 0.00178, 0.07602, "more"),
      ),
    ).toContain("AP50 +0.036 (+0.002 to +0.076)");
    expect(caption(100, 438)).toContain("not symmetric about the figure");
  });
  it("says in words what each box in a picture is", () => {
    const box = { x: 0, y: 0, w: 1, h: 1 };
    expect(
      itemLine({ kind: "hit", label: "cup", score: 0.71, box, overlap: 0.83 }),
    ).toBe("hit: cup 71%, overlap 0.83");
    expect(itemLine({ kind: "miss", label: "book", box })).toBe("miss: book");
    expect(
      itemLine({
        kind: "false",
        label: "vase",
        score: 0.52,
        box,
        why: "wrong name",
        labelled: "bowl",
      }),
    ).toBe("false box: vase 52%, wrong name (labelled bowl)");
  });
});

describe("COCO category ids", () => {
  it("cover the detectors' 80 names in COCO's order", () => {
    const names = maps.detector.labels;
    expect(names).toHaveLength(80);
    expect(names.map(cocoId).every((id) => id !== null)).toBe(true);
    expect(new Set(names.map(cocoId)).size).toBe(80);
    expect([
      cocoId("person"),
      cocoId("stop sign"),
      cocoId("cup"),
      cocoId("toothbrush"),
    ]).toEqual([1, 13, 47, 90]);
    expect(cocoId("not a class")).toBeNull();
  });
});
