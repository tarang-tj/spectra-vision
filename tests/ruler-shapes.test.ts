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
  legLengths,
  measureShape,
  polygonArea,
  selfIntersects,
} from "../src/panels/ruler/shapes";

// A tilted plane (plane mm to image px) and a Letter sheet on it.
const MAP: Mat3 = [1.2, 0.1, 300, 0.05, 1.0, 200, 0.0001, 0.0011, 1];
const img = (p: Pt) => applyHomography(MAP, p)!;
const sheetAt = (MAPx: Mat3, y0: number) => {
  const corners = [
    { x: 0, y: y0 },
    { x: 279.4, y: y0 },
    { x: 279.4, y: y0 + 215.9 },
    { x: 0, y: y0 + 215.9 },
  ].map((p) => applyHomography(MAPx, p)!);
  return solveSheet(orderCorners(corners), 279.4, 215.9, false)!;
};
const sheet = sheetAt(MAP, 700);

/** Independent area and perimeter for the truth (not the code under test). */
const shoelace = (pts: Pt[]) =>
  Math.abs(
    pts.reduce(
      (t, a, i) =>
        t +
        (a.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * a.y),
      0,
    ),
  ) / 2;
const around = (pts: Pt[]) =>
  pts.reduce(
    (t, a, i) =>
      t +
      Math.hypot(
        a.x - pts[(i + 1) % pts.length].x,
        a.y - pts[(i + 1) % pts.length].y,
      ),
    0,
  );

const room: Pt[] = [
  { x: 100, y: 800 },
  { x: 2100, y: 820 },
  { x: 2300, y: 2300 },
  { x: 150, y: 2200 },
];

describe("shape geometry", () => {
  it("computes polygon area and leg lengths", () => {
    const sq = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ];
    expect(polygonArea(sq)).toBe(12);
    expect(legLengths(sq, true)).toEqual([4, 3, 4, 3]);
    expect(legLengths(sq, false)).toEqual([4, 3, 4]);
  });
  it("detects a self-intersecting outline and not a simple one", () => {
    const bow = [
      { x: 0, y: 0 },
      { x: 4, y: 3 },
      { x: 4, y: 0 },
      { x: 0, y: 3 },
    ];
    expect(selfIntersects(bow)).toBe(true);
    expect(
      selfIntersects([
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 3 },
        { x: 0, y: 3 },
      ]),
    ).toBe(false);
    // A concave but simple outline is fine.
    expect(
      selfIntersects([
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 6, y: 6 },
        { x: 3, y: 2 },
        { x: 0, y: 6 },
      ]),
    ).toBe(false);
  });
});

describe("measureShape under a known projective map", () => {
  it("recovers the area and perimeter of a room to 1e-6", () => {
    const r = measureShape(sheet, room.map(img), true, 1.5)!;
    const truthArea = shoelace(room),
      truthPerimeter = around(room);
    expect(Math.abs(r.area!.value - truthArea) / truthArea).toBeLessThan(1e-6);
    expect(
      Math.abs(r.length.value - truthPerimeter) / truthPerimeter,
    ).toBeLessThan(1e-6);
    expect(r.legs).toHaveLength(4);
    expect(r.selfIntersecting).toBe(false);
    // Share of simulated taps kept: reported so a dropped share can be shown.
    expect(r.kept).toBeGreaterThan(0.8);
    expect(r.kept).toBeLessThanOrEqual(1);
    expect(r.area!.error).toBeGreaterThan(0);
  });
  it("gives each leg of an open path and their sum", () => {
    const path = room.slice(0, 3),
      r = measureShape(sheet, path.map(img), false, 1.5)!;
    expect(r.legs).toHaveLength(2);
    expect(r.area).toBeNull();
    const truth = [0, 1].map((i) =>
      Math.hypot(path[i].x - path[i + 1].x, path[i].y - path[i + 1].y),
    );
    r.legs.forEach((l, i) =>
      expect(Math.abs(l.value - truth[i]) / truth[i]).toBeLessThan(1e-6),
    );
    expect(r.length.value).toBeCloseTo(truth[0] + truth[1], 4);
  });
  it("says nothing about area when the outline crosses itself", () => {
    const bow = [room[0], room[2], room[1], room[3]].map(img),
      r = measureShape(sheet, bow, true, 1.5)!;
    expect(r.selfIntersecting).toBe(true);
    expect(r.area).toBeNull();
    expect(r.length.value).toBeGreaterThan(0);
  });
  it("is deterministic", () => {
    const a = measureShape(sheet, room.map(img), true, 1.5)!,
      b = measureShape(sheet, room.map(img), true, 1.5, null, 20261008, 401)!;
    expect(measureShape(sheet, room.map(img), true, 1.5)!.area).toEqual(a.area);
    expect(b.area!.error).toBeGreaterThan(0);
  });
  it("is null when a vertex lies beyond the horizon", () => {
    // Find a picture point where the plane map's w is not positive.
    const h = sheet.h,
      x = 300,
      y = (-0.5 - h[8] - h[6] * x) / h[7];
    expect(h[6] * x + h[7] * y + h[8]).toBeLessThan(0);
    expect(
      measureShape(sheet, [img(room[0]), img(room[1]), { x, y }], true, 1.5),
    ).toBeNull();
  });
  it("has an error that grows with distance, on a map with no foreshortening", () => {
    // Pure scale and shift: equal shapes look equal everywhere, so any growth
    // is the error of the reference, not perspective.
    const flat: Mat3 = [2, 0, 100, 0, 2, 100, 0, 0, 1],
      fsheet = sheetAt(flat, 0),
      fimg = (p: Pt) => applyHomography(flat, p)!,
      square = (x: number, y: number) =>
        [
          { x, y },
          { x: x + 300, y },
          { x: x + 300, y: y + 300 },
          { x, y: y + 300 },
        ].map(fimg),
      near = measureShape(fsheet, square(350, 0), true, 1.5)!,
      far = measureShape(fsheet, square(4000, 4000), true, 1.5)!;
    expect(far.area!.error).toBeGreaterThan(near.area!.error * 1.5);
    expect(far.length.error).toBeGreaterThan(near.length.error);
  });
  it("covers the truth within its bar for tap noise of the stated size", () => {
    // 200 independent noisy tappings of the same room: about 95% inside 2 sd.
    let state = 7;
    const rnd = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      },
      gauss = () =>
        Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
    const small: Pt[] = [
        { x: 100, y: 800 },
        { x: 1300, y: 820 },
        { x: 1400, y: 1500 },
        { x: 150, y: 1450 },
      ],
      sigma = 1.5,
      truth = shoelace(small);
    let inside = 0,
      measured = 0;
    const trials = 120;
    for (let t = 0; t < trials; t++) {
      const jit = (p: Pt) => ({
          x: p.x + sigma * gauss(),
          y: p.y + sigma * gauss(),
        }),
        corners = [
          { x: 0, y: 700 },
          { x: 279.4, y: 700 },
          { x: 279.4, y: 915.9 },
          { x: 0, y: 915.9 },
        ].map((p) => jit(img(p))),
        s = solveSheet(orderCorners(corners), 279.4, 215.9, false)!,
        r = measureShape(
          s,
          small.map((p) => jit(img(p))),
          true,
          sigma,
        );
      // Too unstable to give a bar at all counts as not measured, not a miss.
      if (!r) continue;
      measured++;
      if (Math.abs(r.area!.value - truth) <= r.area!.error) inside++;
    }
    expect(measured / trials).toBeGreaterThan(0.8);
    // A 2 sd bar should hold most of the time; this guards against a bar that
    // is far too small (for example one that ignores the reference corners).
    expect(inside / measured).toBeGreaterThan(0.85);
  });
});
