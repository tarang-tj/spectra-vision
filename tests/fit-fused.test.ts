/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Box tool with a second reference fused into the floor: the verdict
// against truth, and what the sentence beside it says the bar covers.
import { describe, it, expect } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import { getBox, resetBox, setBox } from "../src/panels/ruler/fit/box-state";
import { FIT_COVERAGE, verdicts } from "../src/panels/ruler/fit/verdict";
import { BASIS, gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";
import { REFERENCES } from "../src/panels/ruler/references";
import {
  addReference,
  bindSource,
  finishShape,
  getState,
  place,
  resetRuler,
  setCustom,
  setKnown,
  setRef,
  setTape,
  setTool,
} from "../src/panels/ruler/store";
import {
  alcove,
  alcoveCentre,
  IMAGE,
  sheetCorners,
  shoot,
  toRuler,
  type P,
} from "./fixtures/fit-scene";

const A4 = REFERENCES.find((r) => r.id === "a4")!,
  /** Where the second sheet lies on the floor (mm), clear of the board. */
  SECOND = { x: 1500, y: 1900 },
  exact = (p: P) => p;

/** The board, a 2100 mm alcove, a 950 mm span and a 2000 x 900 mm box in the
 * middle of the alcove (truth: 50 mm of clearance, and 50 mm to spare for
 * the depth in the span); then, when asked, an A4 sheet as a second
 * reference, or the span typed in as a known 95 cm. Every tap goes through
 * `nudge`. */
function read(more: "nothing" | "second" | "known", nudge = exact) {
  const tap = (x: number, y: number) => place(nudge(shoot(x, y)));
  resetRuler();
  resetBox();
  setRef("custom");
  setCustom("1000", "700");
  bindSource(1, IMAGE.w, IMAGE.h, 1);
  for (const c of sheetCorners()) place(nudge(c));
  setTool("area");
  for (const c of alcove(2100)) tap(c.x, c.y);
  finishShape();
  setTool("span");
  tap(400, 1300);
  tap(1350, 1300);
  if (more === "known") {
    setTape(0, "95");
    setKnown(0, true);
  }
  if (more === "second") {
    addReference(A4);
    tap(SECOND.x, SECOND.y);
    tap(SECOND.x + A4.long, SECOND.y);
    tap(SECOND.x + A4.long, SECOND.y + A4.short);
    tap(SECOND.x, SECOND.y + A4.short);
  }
  setTool("box");
  const at = toRuler(alcoveCentre(2100));
  setBox({ at, w: 2000, d: 900, h: 850, rot: 0 }, "test");
  const s = getState(),
    d = derive(s),
    { rows, basis } = verdicts(s, d, getBox());
  return {
    fused: d.sheet?.fused ?? null,
    outline: rows.find((r) => r.label === "Area 1")!.verdicts[0],
    span: rows.find((r) => r.label === "Measurement 1")!.verdicts,
    basis: basis!,
  };
}

describe("the Box tool with a second reference in view", () => {
  it("gives the true clearance and room to spare, with narrower bars", () => {
    const plain = read("nothing"),
      two = read("second");
    expect(plain.fused).toBeNull();
    expect(two.fused!.rects).toBe(1);
    expect(two.outline.mm).toBeCloseTo(50, 3);
    expect(two.span[0].mm).toBeCloseTo(-1050, 3);
    expect(two.span[1].mm).toBeCloseTo(50, 3);
    // The bars come from retakes of the fused solve, not of the board alone.
    for (const [bar, was] of [
      [two.outline.errorMm, plain.outline.errorMm],
      [two.span[1].errorMm, plain.span[1].errorMm],
    ]) {
      expect(bar).toBeGreaterThan(1);
      expect(bar).toBeLessThan(was);
    }
  });

  it("holds the truth as often as the panel says when every tap is a little off", () => {
    const RETAKES = 200,
      normal = gaussian(seededRandom(4242)),
      nudge = (p: P) => ({ x: p.x + 1.5 * normal(), y: p.y + 1.5 * normal() });
    let outline = 0,
      span = 0;
    for (let i = 0; i < RETAKES; i++) {
      const got = read("second", nudge);
      if (Math.abs(got.outline.mm - 50) <= got.outline.errorMm) outline++;
      if (Math.abs(got.span[1].mm - 50) <= got.span[1].errorMm) span++;
    }
    console.info(
      `fit, second reference: ${outline} of ${RETAKES} retakes hold the true clearance, ${span} of ${RETAKES} the true room to spare in the span`,
    );
    // Observed 2026-10-10: 172 of 200 (86.0%) for the clearance, 193 of 200
    // (96.5%) for the span. The clearance under-covers and the panel says
    // so in these numbers; a share of 86% over 200 retakes scatters by 2.5
    // points (one sd), so more than 5 points either way is a real change
    // and the sentence must be measured again.
    expect(
      Math.abs(outline / RETAKES - FIT_COVERAGE.centredSecond / 100),
      "update FIT_COVERAGE",
    ).toBeLessThanOrEqual(0.05);
    // 2 sd holds 95.4%, and 200 retakes scatter that by 1.5 points.
    expect(span / RETAKES).toBeGreaterThanOrEqual(0.92);
  }, 120_000);

  it("says what the bar covers, differently once a reference is fused in", () => {
    const plain = read("nothing"),
      two = read("second");
    // The outline verdict: the Ruler's own sentence sits inside it.
    expect(plain.outline.measured.basis).toBe(plain.basis);
    expect(plain.basis).toContain(BASIS);
    expect(plain.basis).toContain("Each retake moves the taps on the outline");
    expect(two.basis).not.toBe(plain.basis);
    expect(two.basis).not.toContain(BASIS);
    expect(two.basis).toContain("the corners of every reference included");
    expect(two.basis).toContain("the sizes typed for it");
    // The measured share is for one reference; it is not claimed for two.
    expect(plain.basis).toContain("91 times in 100");
    expect(two.basis).not.toContain("91 times in 100");
    expect(two.basis).toContain("a second reference in view");
    expect(two.basis).toContain("86 times in 100");
    // The span verdicts carry the span's own sentence.
    for (const v of plain.span) expect(v.measured.basis).toBe(BASIS);
    for (const v of two.span) {
      expect(v.measured.basis).not.toBe(BASIS);
      expect(v.measured.basis).toBe(derive(getState()).basis);
      expect(v.measured.basis).toContain("the corners of every reference");
    }
    // A known span instead: its ends and the tape are named, and no share
    // is claimed, because none was measured for that case.
    const known = read("known");
    expect(known.fused).toMatchObject({ rects: 0, spans: 1 });
    for (const basis of [known.basis, known.span[0].measured.basis]) {
      expect(basis).toContain("the ends of every known span");
      expect(basis).toContain("a tape uncertainty of 2 mm");
    }
    expect(known.basis).not.toContain("times in 100");
    expect(known.basis).toContain("was not measured");
  });
});
