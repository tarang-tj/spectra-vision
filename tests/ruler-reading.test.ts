/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { measured } from "../src/measure/noise";
import { placeLabels, type Sized } from "../src/panels/ruler/overlay-labels";
import {
  barText,
  FIX,
  isUncertainText,
  readingText,
  shortReading,
  tooUncertain,
} from "../src/panels/ruler/reading";
import { threeWay } from "../src/panels/ruler/fit/verdict";
import type { Numbers } from "../src/panels/ruler/walls/numbers";
import { heightUncertain } from "../src/panels/ruler/walls/text";

const m = (value: number, error: number, unit = "cm") =>
  measured(value, error, unit, "test");

describe("a size too uncertain to state", () => {
  it("is one whose bar is as large as the size, and not one just under", () => {
    expect(tooUncertain(m(100, 99.9))).toBe(false);
    expect(tooUncertain(m(100, 100))).toBe(true);
    expect(tooUncertain(m(100, 100.1))).toBe(true);
    // A clearance can be negative: the size of it is what counts.
    expect(tooUncertain(m(-100, 99.9))).toBe(false);
    expect(tooUncertain(m(-100, 100))).toBe(true);
    // No bar at all is the formatter's business ("± 0", "not measured").
    expect(tooUncertain(m(0, 0))).toBe(false);
    expect(tooUncertain(m(5, NaN))).toBe(false);
  });
  it("draws the same line as the Box verdict's too close to call", () => {
    for (const [mm, bar] of [
      [50, 49.9],
      [50, 50],
      [-50, 49.9],
      [-50, 50],
      [8, 13],
    ])
      expect(tooUncertain(m(mm, bar)), `${mm} ± ${bar}`).toBe(
        threeWay(mm, bar) === "close",
      );
  });
  it("prints value and bar on the sure side of the line", () => {
    expect(readingText(m(240, 120))).toBe("240 ± 120 cm");
    expect(readingText(m(4.2, 0.13, "m"))).toBe("4.20 ± 0.13 m");
  });
  it("says so in one line, with the bar and the fix, on the other side", () => {
    // The first still of the visual pass: a 1 m span read as "0 ± 2000 cm".
    const text = readingText(m(67.4, 1823.2));
    expect(text).toBe(`too uncertain to state (bar ± 1800 cm). ${FIX}`);
    expect(text).not.toMatch(/^-?\d/);
    expect(FIX).toMatch(/second reference/);
    expect(FIX).toMatch(/known span/);
    expect(isUncertainText(text)).toBe(true);
    expect(isUncertainText("240 ± 120 cm")).toBe(false);
  });
  it("has a short form for a label, and leaves other text alone", () => {
    expect(shortReading(readingText(m(0.3, 12, "m")))).toBe(
      "too uncertain (± 12 m)",
    );
    expect(shortReading("240 ± 120 cm")).toBe("240 ± 120 cm");
    expect(shortReading("not measured")).toBe("not measured");
  });
  it("writes the bar as the shared formatter rounds it", () => {
    expect(barText(m(1, 0.134, "m"))).toBe("± 0.13 m");
    expect(barText(m(1, 37, "mm"))).toBe("± 40 mm");
    expect(barText(m(1, 3.6, "m²"))).toBe("± 4 m²");
  });
});

describe("Walls heights too uncertain to draw", () => {
  const withHeight = (value: number, error: number) =>
    ({ meanHeight: { value, error } }) as Numbers;
  it("is the same line, on the mean height", () => {
    expect(heightUncertain(withHeight(2400, 2399))).toBe(false);
    expect(heightUncertain(withHeight(2400, 2400))).toBe(true);
    // The straight-down still of the visual pass: "2 ± 4 m".
    expect(heightUncertain(withHeight(2400, 4000))).toBe(true);
    expect(heightUncertain({ meanHeight: null } as Numbers)).toBe(false);
  });
});

describe("stage label placement", () => {
  const label = (x: number, y: number, rank: Sized["rank"], w = 60): Sized => ({
      x,
      y,
      w,
      h: 18,
      rank,
    }),
    hits = (
      a: { x: number; y: number; w: number; h: number } | null,
      b: typeof a,
    ) =>
      !!a &&
      !!b &&
      a.x < b.x + b.w &&
      b.x < a.x + a.w &&
      a.y < b.y + b.h &&
      b.y < a.y + a.h;

  it("leaves a lone label where it was asked for", () => {
    expect(placeLabels([label(100, 100, "key")], [], 800, 600)).toEqual([
      { x: 100, y: 100, w: 60, h: 18 },
    ]);
  });
  it("moves the lower rank off a label of higher rank, whatever the order", () => {
    // A corner number asked for first, right where a reading then lands.
    const [number, reading] = placeLabels(
      [label(100, 100, "detail", 16), label(96, 98, "key")],
      [],
      800,
      600,
    );
    expect(reading).toEqual({ x: 96, y: 98, w: 60, h: 18 });
    expect(number).not.toBeNull();
    expect(hits(number, reading)).toBe(false);
  });
  it("keeps labels off handles", () => {
    const handle = { x: 110, y: 104, w: 10, h: 10 },
      [got] = placeLabels([label(100, 100, "optional")], [handle], 800, 600);
    expect(hits(got, handle)).toBe(false);
  });
  it("drops a label that is not a result when nothing is free, and keeps a result", () => {
    // A stage only one label wide and tall: every spot is the same spot.
    const got = placeLabels(
      [label(0, 0, "optional"), label(0, 0, "key"), label(0, 0, "key")],
      [],
      64,
      22,
    );
    expect(got[0]).toBeNull();
    expect(got[1]).not.toBeNull();
    expect(got[2]).not.toBeNull();
  });
  it("brings a label that runs off the stage back inside it", () => {
    const [got] = placeLabels([label(380, -30, "key", 120)], [], 390, 240);
    expect(got!.x + got!.w).toBeLessThanOrEqual(390);
    expect(got!.y).toBeGreaterThanOrEqual(0);
  });
  it("leaves details out on a narrow stage", () => {
    expect(
      placeLabels(
        [label(10, 10, "detail"), label(200, 10, "optional")],
        [],
        390,
        240,
        true,
      ).map((b) => !!b),
    ).toEqual([false, true]);
  });
});
