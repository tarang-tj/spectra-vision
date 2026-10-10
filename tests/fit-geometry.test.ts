/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  clearance,
  footprintCorners,
  type P,
} from "../src/panels/ruler/fit/geometry";
import { threeWay, verdictOf } from "../src/panels/ruler/fit/verdict";

const box = (x: number, y: number, w: number, d: number, rot = 0) =>
  footprintCorners({ x, y, w, d, rot });

describe("the box's footprint", () => {
  it("is the typed width by the typed depth about its centre", () => {
    expect(box(100, 50, 400, 200)).toEqual([
      { x: -100, y: -50 },
      { x: 300, y: -50 },
      { x: 300, y: 150 },
      { x: -100, y: 150 },
    ]);
  });

  it("turns counter-clockwise about its centre", () => {
    // A quarter turn: the width now runs along y.
    const q = box(100, 50, 400, 200, 90);
    [
      [200, -150],
      [200, 250],
      [0, 250],
      [0, -150],
    ].forEach(([x, y], i) => {
      expect(q[i].x).toBeCloseTo(x, 9);
      expect(q[i].y).toBeCloseTo(y, 9);
    });
    // 30 degrees, worked by hand: corner 1 is (200, -100) before the turn.
    const c = box(0, 0, 400, 200, 30)[1];
    expect(c.x).toBeCloseTo(200 * Math.cos(Math.PI / 6) + 100 * 0.5, 9);
    expect(c.y).toBeCloseTo(200 * 0.5 - 100 * Math.cos(Math.PI / 6), 9);
    // Turning keeps every corner the same distance from the centre.
    for (const p of box(7, -3, 400, 200, 73))
      expect(Math.hypot(p.x - 7, p.y + 3)).toBeCloseTo(Math.hypot(200, 100), 9);
  });
});

// A 2100 x 1000 room, and an L: a 3000 x 2000 room with its top right
// 1500 x 1000 quarter walled off (the inner corner is at (1500, 1000)).
const ROOM: P[] = [
    { x: 0, y: 0 },
    { x: 2100, y: 0 },
    { x: 2100, y: 1000 },
    { x: 0, y: 1000 },
  ],
  ELL: P[] = [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 1000 },
    { x: 1500, y: 1000 },
    { x: 1500, y: 2000 },
    { x: 0, y: 2000 },
  ];

describe("clearance inside a convex outline", () => {
  it("is the smallest gap when the box is inside", () => {
    // 2000 x 900 centred: 50 at every side.
    expect(clearance(box(1050, 500, 2000, 900), ROOM)).toBeCloseTo(50, 9);
    // Pushed 30 to the left: 20 on that side.
    expect(clearance(box(1020, 500, 2000, 900), ROOM)).toBeCloseTo(20, 9);
    // The same whichever way round the outline was tapped.
    expect(
      clearance(box(1020, 500, 2000, 900), [...ROOM].reverse()),
    ).toBeCloseTo(20, 9);
  });

  it("is zero when the box touches a side", () => {
    expect(clearance(box(1000, 500, 2000, 900), ROOM)).toBeCloseTo(0, 9);
  });

  it("is minus the overhang when the box overlaps a side", () => {
    // 80 past the right wall.
    expect(clearance(box(1180, 500, 2000, 900), ROOM)).toBeCloseTo(-80, 9);
    // Too wide by 100 and centred: 50 over at each wall.
    expect(clearance(box(1050, 500, 2200, 900), ROOM)).toBeCloseTo(-50, 9);
  });

  it("is minus the distance of the furthest corner when the box is outside", () => {
    // A 200 x 200 box whose near edge is 300 right of the room: its far
    // corners are 500 beyond the wall.
    expect(clearance(box(2500, 500, 200, 200), ROOM)).toBeCloseTo(-500, 9);
  });

  it("sees a turned box that no longer fits", () => {
    // 900 x 900 fits square-on with 50 to spare, and not on the diagonal.
    expect(clearance(box(1050, 500, 900, 900), ROOM)).toBeCloseTo(50, 9);
    expect(clearance(box(1050, 500, 900, 900, 45), ROOM)).toBeCloseTo(
      500 - 450 * Math.SQRT2,
      9,
    );
  });
});

describe("clearance inside an L-shaped outline", () => {
  it("is the smallest gap when the box is inside one arm", () => {
    // 1000 x 600 in the bottom arm: 200 below it, 200 to the walled-off part.
    expect(clearance(box(2200, 500, 1000, 600), ELL)).toBeCloseTo(200, 9);
    // Near the inner corner, which is the closest thing to it.
    expect(clearance(box(1000, 600, 600, 600), ELL)).toBeCloseTo(
      Math.hypot(200, 100),
      9,
    );
  });

  it("is zero when the box touches the inner wall", () => {
    expect(clearance(box(2200, 700, 1000, 600), ELL)).toBeCloseTo(0, 9);
  });

  it("is negative when the box covers the inner corner", () => {
    // Centred on the inner corner: its top right quarter is in the wall,
    // 200 deep both ways.
    expect(clearance(box(1500, 1000, 400, 400), ELL)).toBeCloseTo(-200, 9);
    // Only the box's top edge crosses into the walled-off part, by 150.
    expect(clearance(box(2200, 850, 1000, 600), ELL)).toBeCloseTo(-150, 9);
  });

  it("is negative when the box is wholly in the walled-off part", () => {
    // Its far corner is 500 from the nearest wall of the room.
    expect(clearance(box(2000, 1400, 200, 200), ELL)).toBeCloseTo(-500, 9);
  });
});

describe("the three-way verdict", () => {
  it("says fits only when the whole bar is above zero", () => {
    expect(threeWay(50, 49.9)).toBe("fits");
    expect(threeWay(50, 50)).toBe("close");
    expect(threeWay(50, 80)).toBe("close");
  });
  it("says does not fit only when the whole bar is below zero", () => {
    expect(threeWay(-50, 49.9)).toBe("over");
    expect(threeWay(-50, 50)).toBe("close");
    expect(threeWay(0, 0)).toBe("close");
    expect(threeWay(0, 10)).toBe("close");
  });
  it("words each case with the value and its bar", () => {
    expect(verdictOf("outline", 52, 13, "mm", "b").text).toBe(
      "Fits, with 52 ± 13 mm of clearance",
    );
    expect(verdictOf("outline", -52, 13, "cm", "b").text).toBe(
      "Does not fit: over by 5.2 ± 1.3 cm",
    );
    expect(verdictOf("outline", -8, 13, "mm", "b").text).toBe(
      "Too close to call: clearance too uncertain to state (bar ± 13 mm). Add a larger or second reference, or a known span.",
    );
    expect(verdictOf("width", 120, 13, "mm", "b").text).toBe(
      "Width passes, with 120 ± 13 mm to spare",
    );
    expect(verdictOf("depth", -120, 13, "mm", "b").text).toBe(
      "Depth does not pass: over by 120 ± 13 mm",
    );
  });
});
