/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Further references, known spans and the tape test, through the store and
// derive as the panel uses them. Bad input gets a plain message, never NaN.
import { beforeEach, describe, it, expect } from "vitest";
import { cameraOf, cameraTrials } from "../src/panels/ruler/camera-of";
import { derive, resultsText } from "../src/panels/ruler/derive";
import { planCsv } from "../src/panels/ruler/export-plan";
import { quadsOverlap } from "../src/panels/ruler/fuse-inputs";
import { REFERENCES } from "../src/panels/ruler/references";
import {
  addReference,
  bindSource,
  getState,
  place,
  removeReference,
  resetRuler,
  setKnown,
  setRef,
  setTape,
  setTapeSd,
  setUnit,
  undo,
} from "../src/panels/ruler/store";
import {
  KNOWN,
  LETTER,
  rectangle,
  SHEET_1,
  SHEET_2,
  SHOT,
  shoot,
  SPANS,
  type P,
  type Shot,
} from "./fixtures/ruler-accuracy-scene";

const LETTER_REF = REFERENCES.find((r) => r.id === "letter")!;
const d = () => derive(getState());
const tapAll = (shot: Shot, pts: P[]) =>
  pts.forEach((p) => place(shoot(shot, p)));
/** The first sheet tapped in the fixed room, units in mm. */
function start(shot = SHOT, at = SHEET_1) {
  bindSource(1, shot.w, shot.h, 1);
  setRef("letter");
  setUnit("mm");
  tapAll(shot, rectangle(at, LETTER.long, LETTER.short, 0.3));
}
/** Every piece of text the panel, the clipboard and the CSV would show. */
function allText(): string {
  const s = getState(),
    v = d();
  return [
    v.problem,
    ...v.rows.flatMap((r) => [r.text, ...r.warnings]),
    ...(v.known?.refs.map((r) => r.text) ?? []),
    ...(v.known?.warnings ?? []),
    v.known?.summary,
    v.known?.tapeSdProblem,
    ...v.tape.checks.flatMap((c) => Object.values(c).map(String)),
    v.tape.tally,
    v.basis,
    resultsText(s, v),
    planCsv(s, v),
  ].join("\n");
}

describe("further known sizes", () => {
  beforeEach(() => resetRuler());

  it("a second sheet and a known span narrow a far span and move it to the truth", () => {
    start();
    tapAll(SHOT, SPANS.far);
    const one = d().rows[0].span!;
    expect(d().known!.summary).toBeNull();
    addReference(LETTER_REF);
    expect(d().known!.refs[0].text).toMatch(/4 corners still to tap/);
    tapAll(SHOT, rectangle(SHEET_2, LETTER.long, LETTER.short, 1.1));
    expect(d().known!.refs[0].text).toMatch(/used\.$/);
    expect(d().known!.summary).toBe(
      "One surface solved from 2 references together.",
    );
    const two = d().rows[0].span!;
    expect(two.errorMm).toBeLessThan(one.errorMm / 5);
    expect(two.mm).toBeCloseTo(1000, 3);
    // A tape-measured wall: typed, then used as a known span.
    tapAll(SHOT, KNOWN);
    setTape(1, "3000");
    expect(d().known!.summary).toBe(
      "One surface solved from 2 references together.",
    );
    setKnown(1, true);
    expect(d().known!.summary).toBe(
      "One surface solved from 2 references and 1 known span together.",
    );
    expect(d().rows[0].span!.errorMm).toBeLessThan(two.errorMm);
    expect(d().basis).toMatch(/tape uncertainty of 2 mm on each typed length/);
    expect(d().basis).not.toMatch(/simulated rooms/);
    // A looser tape widens the bar again.
    const tight = d().rows[0].span!.errorMm;
    setTapeSd("50");
    expect(d().rows[0].span!.errorMm).toBeGreaterThan(tight);
    expect(d().basis).toMatch(/tape uncertainty of 50 mm/);
    // The camera and its trials follow the fused surface.
    const s = getState(),
      cam = cameraOf(s, d())!,
      { trials, kept } = cameraTrials(s, d(), 120);
    expect(cam.f).toBeCloseTo(SHOT.f, 0);
    expect(cam.centre[2]).toBeCloseTo(SHOT.up, 0);
    expect(kept).toBe(1);
    expect(trials).toHaveLength(120);
    const heights = trials.map((t) => t.camera!.centre[2]);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(1);
    // Removing the sheet and the known span gives back the first solve.
    removeReference(0);
    setKnown(1, false);
    expect(d().known!.summary).toBeNull();
    expect(d().rows[0].span).toEqual(one);
    expect(allText()).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("one reference and a known span says its bar under-covers", () => {
    start();
    tapAll(SHOT, KNOWN);
    setTape(0, "3000");
    setKnown(0, true);
    expect(d().basis).toMatch(/91 to 94 of 100 simulated rooms/);
  });

  it("Undo takes back the corners of a reference being tapped, then the reference", () => {
    start();
    addReference(LETTER_REF);
    place({ x: 900, y: 500 });
    place({ x: 950, y: 500 });
    undo();
    expect(getState().extraRefs[0].corners).toHaveLength(1);
    undo();
    undo();
    expect(getState().extraRefs).toHaveLength(0);
    expect(getState().corners).toHaveLength(4);
  });
});

describe("degenerate known sizes get a plain message", () => {
  beforeEach(() => resetRuler());

  it("a second reference that overlaps the first is not used", () => {
    start();
    tapAll(SHOT, SPANS.near);
    const before = d().rows[0].span!;
    addReference(LETTER_REF);
    // The same sheet tapped again, nudged: no new information.
    rectangle(SHEET_1, LETTER.long, LETTER.short, 0.3).forEach((p) => {
      const q = shoot(SHOT, p);
      place({ x: q.x + 20, y: q.y + 14 });
    });
    expect(d().known!.refs[0]).toEqual({
      text: "Reference 2 (US Letter, 279.4 x 215.9 mm) is not used: it overlaps another reference. Each reference must be a separate object.",
      warn: true,
    });
    expect(d().known!.summary).toBeNull();
    expect(d().rows[0].span).toEqual(before);
    expect(allText()).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("a second reference with collinear taps is not used", () => {
    start();
    addReference(LETTER_REF);
    for (const x of [900, 1000, 1100, 1200]) place({ x, y: 300 + x / 100 });
    expect(d().known!.refs[0].text).toMatch(
      /is not used: (corners overlap or are nearly in a line|corners do not form a convex four-sided shape|the reference is too small to measure from)\.$/,
    );
    expect(d().known!.refs[0].warn).toBe(true);
    expect(d().sheet!.fused).toBeUndefined();
    expect(allText()).not.toMatch(/NaN|undefined|Infinity/);
  });

  it.each(["0", "abc", "-5", "1e999", " "])(
    "a typed length of %j is not used as a known span",
    (typed) => {
      start();
      tapAll(SHOT, KNOWN);
      setTape(0, "3000");
      setKnown(0, true);
      expect(d().sheet!.fused).toBeDefined();
      setTape(0, typed);
      // Clearing the box also stops using the span; anything else is kept
      // and explained.
      expect(d().sheet!.fused).toBeUndefined();
      if (typed.trim()) {
        expect(d().known!.warnings).toEqual([
          "Measurement 1 is not used as a known span: type its length as a number greater than zero.",
        ]);
        expect(d().tape.checks[0].verdict).toBe(
          "Type the tape reading as a number greater than zero.",
        );
      } else expect(getState().measures[0].known).toBe(false);
      expect(d().tape.tally).toBeNull();
      expect(allText()).not.toMatch(/NaN|undefined|Infinity/);
    },
  );

  it("a known span with an end beyond the horizon is not used", () => {
    // A camera tilted 10 degrees down sees the horizon inside the picture.
    const low: Shot = { ...SHOT, tilt: (10 * Math.PI) / 180 },
      horizon = low.h / 2 - low.f * Math.tan(low.tilt);
    expect(horizon).toBeGreaterThan(100);
    start(low, { x: 0, y: 4000 });
    expect(d().sheet).not.toBeNull();
    place(shoot(low, { x: 0, y: 6000 }));
    place({ x: 800, y: horizon - 60 });
    setTape(0, "3000");
    setKnown(0, true);
    expect(d().known!.warnings).toEqual([
      "Measurement 1 is not used as a known span: a point is at or beyond the horizon of the surface.",
    ]);
    expect(d().sheet!.fused).toBeUndefined();
    expect(d().rows[0].text).toBe("not measured");
    expect(d().tape.checks[0].verdict).toBe("not measured");
    expect(allText()).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("an unusable tape uncertainty falls back to 2 mm and says so", () => {
    start();
    for (const typed of ["", "x", "-1", "1000"]) {
      setTapeSd(typed);
      expect(d().known!.tapeSdMm).toBe(2);
      expect(d().known!.tapeSdProblem).toMatch(/2 mm is used/);
    }
    setTapeSd("0");
    expect(d().known!.tapeSdProblem).toBeNull();
  });

  it("tells separate quadrilaterals from overlapping ones", () => {
    const q = (x: number, y: number, w = 10) => [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + w },
      { x, y: y + w },
    ];
    expect(quadsOverlap(q(0, 0), q(20, 0))).toBe(false);
    expect(quadsOverlap(q(0, 0), q(5, 5))).toBe(true);
    expect(quadsOverlap(q(0, 0, 30), q(10, 10))).toBe(true);
  });
});

describe("the tape test", () => {
  beforeEach(() => resetRuler());

  it("lists each checked span and tallies the tape values inside their bars", () => {
    start();
    addReference(LETTER_REF);
    tapAll(SHOT, rectangle(SHEET_2, LETTER.long, LETTER.short, 1.1));
    tapAll(SHOT, SPANS.near);
    tapAll(SHOT, SPANS.middle);
    tapAll(SHOT, SPANS.far);
    expect(d().tape).toEqual({ checks: [], tally: null });
    setUnit("cm");
    setTape(0, "100.2"); // 2 mm off: inside
    setTape(1, "150"); // half a metre off: outside
    const { checks, tally } = d().tape;
    expect(tally).toBe("1 of 2 tape values inside their bars");
    expect(checks.map((c) => [c.index, c.inside, c.verdict])).toEqual([
      [0, true, "inside the bar"],
      [1, false, "outside the bar"],
    ]);
    expect(checks[0].tape).toBe("100.2 cm");
    expect(checks[0].reading).toBe(d().rows[0].text);
    expect(checks[0].difference).toMatch(/^-0\.\d+ cm$/);
    expect(checks[1].difference).toMatch(/^-50(\.\d+)? cm$/);
    // One precision down the column, whatever each row's own bar is.
    const places = (t: string) => (t.split(" ")[0].split(".")[1] ?? "").length;
    expect(places(checks[1].difference)).toBe(places(checks[0].difference));
    // A reading keeps its meaning when the unit shown changes afterwards.
    setUnit("mm");
    expect(d().tape.checks[0].tape).toBe("1002 mm");
    expect(d().tape.tally).toBe("1 of 2 tape values inside their bars");
    // A check never corrects: the readings are what they were without it.
    const reading = d().rows[1].span!.mm;
    setTape(1, "");
    expect(d().rows[1].span!.mm).toBe(reading);
    expect(d().tape.tally).toBe("1 of 1 tape value inside its bar");
    // A span used as a known span is listed but not counted.
    setTape(2, "1000");
    setKnown(2, true);
    expect(d().tape.tally).toBe("1 of 1 tape value inside its bar");
    expect(d().tape.checks[1].verdict).toBe(
      "used as a known span, so not a check",
    );
    // The CSV and the copied text carry the rows and the tally.
    const csv = planCsv(getState(), d()).trim().split("\n"),
      tape = csv.filter((l) => /^span \d+,tape,/.test(l));
    expect(tape).toHaveLength(2);
    expect(tape[0]).toMatch(/^span 1,tape,1002,,mm,,/);
    expect(tape[0]).toMatch(
      /reading minus tape -\d+(\.\d+)? mm; inside the bar/,
    );
    expect(tape[1]).toMatch(/used as a known span, so not a check/);
    expect(
      csv.some((l) =>
        /^tape test,tally,.*1 of 1 tape value inside its bar/.test(l),
      ),
    ).toBe(true);
    const text = resultsText(getState(), d());
    expect(text).toMatch(/Tape test: 1 of 1 tape value inside its bar\./);
    expect(text).toMatch(
      /One surface solved from 2 references and 1 known span together\./,
    );
    expect(allText()).not.toMatch(/NaN|undefined|Infinity/);
  });
});
