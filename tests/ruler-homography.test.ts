/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  applyHomography,
  degenerateReason,
  orderCorners,
  planeDistance,
  solveHomography,
  solveSheet,
  type Mat3,
  type Pt,
} from "../src/panels/ruler/homography";
import { fromMm, toMm } from "../src/panels/ruler/units";
import { customReference } from "../src/panels/ruler/references";

// A known projective map from plane millimetres to image pixels.
const PLANE_TO_IMAGE: Mat3 = [
  2.1, 0.35, 310, -0.2, 1.6, 140, 0.0004, 0.0011, 1,
];
const toImage = (p: Pt) => applyHomography(PLANE_TO_IMAGE, p)!;
const LETTER: Pt[] = [
  { x: 100, y: 50 },
  { x: 100 + 279.4, y: 50 },
  { x: 100 + 279.4, y: 50 + 215.9 },
  { x: 100, y: 50 + 215.9 },
];

describe("homography", () => {
  it("recovers a known projective map to 1e-6", () => {
    const img = LETTER.map(toImage),
      h = solveHomography(img, LETTER)!;
    expect(h).not.toBeNull();
    for (const p of [
      { x: 0, y: 0 },
      { x: 500, y: 40 },
      { x: 250, y: 600 },
      { x: 90, y: 333 },
    ]) {
      const back = applyHomography(h, toImage(p))!;
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it("measures a plane distance exactly from a perspective picture", () => {
    const sheet = solveSheet(
        orderCorners(LETTER.map(toImage)),
        279.4,
        215.9,
        false,
      )!,
      a = { x: 120, y: 700 },
      b = { x: 620, y: 700 + 300 },
      d = planeDistance(sheet.h, toImage(a), toImage(b))!;
    expect(d).toBeCloseTo(Math.hypot(500, 300), 6);
  });

  it("returns null at the horizon", () => {
    const h: Mat3 = [1, 0, 0, 0, 1, 0, 1, 0, -10];
    expect(applyHomography(h, { x: 10, y: 3 })).toBeNull();
  });
});

describe("corner ordering", () => {
  const img = LETTER.map(toImage);
  const permutations = (xs: Pt[]): Pt[][] =>
    xs.length < 2
      ? [xs]
      : xs.flatMap((x, i) =>
          permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((r) => [
            x,
            ...r,
          ]),
        );
  it("is the same for every tap order", () => {
    const expected = orderCorners(img);
    for (const order of permutations(img))
      expect(orderCorners(order)).toEqual(expected);
  });
  it("winds clockwise on screen (positive signed area, y down)", () => {
    const o = orderCorners(img);
    let area2 = 0;
    for (let i = 0; i < 4; i++) {
      const a = o[i],
        b = o[(i + 1) % 4];
      area2 += a.x * b.y - b.x * a.y;
    }
    expect(area2).toBeGreaterThan(0);
  });
  it("breaks a tie between equally top-left corners the same way", () => {
    const diamond: Pt[] = [
      { x: 100, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 200 },
      { x: 200, y: 100 },
    ];
    const first = orderCorners(diamond)[0];
    for (const order of permutations(diamond))
      expect(orderCorners(order)[0]).toEqual(first);
  });
});

describe("side assignment and degenerate input", () => {
  const ordered = orderCorners(LETTER.map(toImage));
  it("gives the longer-looking pair the long side, and Swap flips it", () => {
    const a = solveSheet(ordered, 279.4, 215.9, false)!,
      b = solveSheet(ordered, 279.4, 215.9, true)!;
    expect(a.firstIsLong).not.toBe(b.firstIsLong);
    expect(a.firstIsLong).toBe(true);
  });
  it("rejects three nearly collinear corners", () => {
    const flat: Pt[] = [
      { x: 0, y: 0 },
      { x: 100, y: 1 },
      { x: 200, y: 0 },
      { x: 100, y: 120 },
    ];
    expect(degenerateReason(orderCorners(flat))).toMatch(/line/);
    expect(solveSheet(orderCorners(flat), 279.4, 215.9, false)).toBeNull();
  });
  it("rejects a tiny area, overlapping taps and a non-convex shape", () => {
    expect(
      degenerateReason(
        orderCorners([
          { x: 0, y: 0 },
          { x: 8, y: 0 },
          { x: 8, y: 8 },
          { x: 0, y: 8 },
        ]),
      ),
    ).toMatch(/small/);
    expect(
      degenerateReason([
        { x: 0, y: 0 },
        { x: 0.5, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]),
    ).toMatch(/line/);
    expect(
      degenerateReason([
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 80, y: 80 },
        { x: 0, y: 200 },
      ]),
    ).toMatch(/convex/);
    expect(degenerateReason(LETTER.slice(0, 3))).toMatch(/four/);
  });
});

describe("units and references", () => {
  it("converts to and from millimetres", () => {
    expect(fromMm(304.8, "ft")).toBeCloseTo(1, 12);
    expect(fromMm(25.4, "in")).toBeCloseTo(1, 12);
    expect(fromMm(1500, "m")).toBeCloseTo(1.5, 12);
    expect(fromMm(42, "cm")).toBeCloseTo(4.2, 12);
    expect(toMm(2, "in")).toBeCloseTo(50.8, 12);
  });
  it("accepts only sane custom sides", () => {
    expect(customReference(100, 300)).toMatchObject({ long: 300, short: 100 });
    expect(customReference(0, 300)).toBeNull();
    expect(customReference(NaN, 300)).toBeNull();
    expect(customReference(100, 1e6)).toBeNull();
  });
});
