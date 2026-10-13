/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classAp,
  meanAp,
  poolClasses,
} from "../src/panels/lab/scorecard/average-precision";
import { matchPicture } from "../src/panels/lab/scorecard/match";

// The reference check: a made-up case scored by COCO's own scorer
// (pycocotools), stored with its answers by scripts/score-fixture.py. The
// same case scored here must give the same numbers.
type Four = [number, number, number, number];
type Case = {
  pycocotools: string;
  expected: {
    ap5095: number;
    ap50: number;
    perClassAp50: Record<string, number>;
  };
  pictures: {
    id: number;
    labels: { label: string; box: Four; crowd: boolean }[];
    boxes: { label: string; score: number; box: Four }[];
  }[];
};
const fixture: Case = JSON.parse(
  readFileSync(resolve("tests/fixtures/score/pycocotools-case.json"), "utf8"),
);
const box = ([x, y, w, h]: Four) => ({ x, y, w, h });
// Ascending image id, as the reference scorer pools them.
const pictures = [...fixture.pictures].sort((a, b) => a.id - b.id),
  pools = poolClasses(
    pictures.map((p) =>
      matchPicture(
        p.boxes.map((b) => ({ ...b, box: box(b.box) })),
        p.labels.map((l) => ({ ...l, box: box(l.box) })),
      ),
    ),
  );

describe("agreement with pycocotools", () => {
  it("has a case worth checking: crowds, tied scores, unlabelled and unboxed classes", () => {
    expect(fixture.pycocotools).toMatch(/^\d+\.\d+/);
    expect(pictures).toHaveLength(20);
    const labels = pictures.flatMap((p) => p.labels),
      boxes = pictures.flatMap((p) => p.boxes);
    expect(labels.filter((l) => l.crowd)).toHaveLength(2);
    expect(boxes.length).toBeGreaterThan(60);
    expect(new Set(boxes.map((b) => b.score)).size).toBeLessThan(boxes.length);
    // A class that is drawn but never labelled, and one labelled but never drawn.
    expect(labels.some((l) => l.label === "clock")).toBe(false);
    expect(boxes.some((b) => b.label === "clock")).toBe(true);
    expect(boxes.some((b) => b.label === "spoon")).toBe(false);
    expect(fixture.expected.perClassAp50.spoon).toBe(0);
    expect(fixture.expected.perClassAp50).not.toHaveProperty("clock");
    // Not a case every scorer gets right by accident.
    expect(fixture.expected.ap50).toBeGreaterThan(0.2);
    expect(fixture.expected.ap50).toBeLessThan(0.9);
    expect(fixture.expected.ap5095).toBeLessThan(fixture.expected.ap50);
  });
  it("gives the same AP over 0.50 to 0.95", () => {
    expect(Math.abs(meanAp(pools)! - fixture.expected.ap5095)).toBeLessThan(
      1e-6,
    );
  });
  it("gives the same AP at 0.50", () => {
    expect(Math.abs(meanAp(pools, [0])! - fixture.expected.ap50)).toBeLessThan(
      1e-6,
    );
  });
  it("gives the same AP at 0.50 for every class, and leaves out the same classes", () => {
    const mine: Record<string, number> = {};
    for (const pool of pools) {
      const ap = classAp(pool, 0);
      if (ap !== null) mine[pool.label] = ap;
    }
    expect(Object.keys(mine).sort()).toEqual(
      Object.keys(fixture.expected.perClassAp50).sort(),
    );
    for (const [name, ap] of Object.entries(fixture.expected.perClassAp50))
      expect(Math.abs(mine[name] - ap), name).toBeLessThan(1e-6);
  });
});
