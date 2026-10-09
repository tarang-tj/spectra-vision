/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  applyHomography,
  orderCorners,
  solveSheet,
  type Mat3,
  type Pt,
} from "../src/panels/ruler/homography";
import {
  BASIS,
  distanceSpread,
  measureSpan,
  MIN_SAMPLES,
  seededRandom,
} from "../src/panels/ruler/monte-carlo";
import { formatMeasured } from "../src/measure/format";

// A tilted plane: the top of the picture is further away.
const MAP: Mat3 = [1.2, 0.1, 300, 0.05, 1.0, 200, 0.0001, 0.0011, 1];
const img = (p: Pt) => applyHomography(MAP, p)!;
const sheetPlane: Pt[] = [
  { x: 0, y: 700 },
  { x: 279.4, y: 700 },
  { x: 279.4, y: 915.9 },
  { x: 0, y: 915.9 },
];
const sheet = solveSheet(
  orderCorners(sheetPlane.map(img)),
  279.4,
  215.9,
  false,
)!;

describe("seeded random", () => {
  it("repeats for a seed and differs between seeds", () => {
    const a = seededRandom(7),
      b = seededRandom(7),
      c = seededRandom(8);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe("error bar", () => {
  const near = [img({ x: 20, y: 710 }), img({ x: 220, y: 710 })] as const;
  it("is deterministic for a seed", () => {
    const one = distanceSpread(sheet, near[0], near[1], 1.5, 11)!,
      two = distanceSpread(sheet, near[0], near[1], 1.5, 11)!,
      other = distanceSpread(sheet, near[0], near[1], 1.5, 12)!;
    expect(two).toEqual(one);
    expect(other.sd).not.toBe(one.sd);
    expect(one.mean).toBeCloseTo(200, 0);
  });
  it("uses at least 300 samples even when asked for fewer", () => {
    expect(
      distanceSpread(sheet, near[0], near[1], 1.5, 1, 10)!.used,
    ).toBeGreaterThanOrEqual(MIN_SAMPLES * 0.8);
  });
  it("grows with distance from the reference", () => {
    const sd = (y: number) =>
      distanceSpread(sheet, img({ x: 20, y }), img({ x: 220, y }), 1.5, 3)!.sd;
    // Same 200 mm span, placed ever further up the tilted plane.
    const close = sd(710),
      mid = sd(1500),
      far = sd(3000);
    expect(mid).toBeGreaterThan(close);
    expect(far).toBeGreaterThan(mid);
  });
  it("grows with tap uncertainty", () => {
    const sd = (s: number) => distanceSpread(sheet, near[0], near[1], s, 3)!.sd;
    expect(sd(3)).toBeGreaterThan(sd(1) * 2);
  });
  it("reports mean plus or minus 2 sd with the fixed basis", () => {
    const span = measureSpan(sheet, near[0], near[1], 1.5, "cm", 5)!;
    expect(span.measured.error).toBeCloseTo(span.errorMm / 10, 12);
    expect(span.measured.basis).toBe(BASIS);
    expect(BASIS).toBe(
      "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.",
    );
    expect(formatMeasured(span.measured)).toMatch(/^\d+(\.\d+)? ± [\d.]+ cm$/);
  });
});
