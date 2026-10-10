/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  COLOR_STEPS,
  colorAt,
  colorize,
  colorTable,
  luminance,
} from "../src/vision/depth/colormap";

describe("the depth colour scale", () => {
  it("never gets darker along the scale, so it still reads without hue", () => {
    const table = colorTable(),
      light = (i: number) =>
        luminance([table[i * 4], table[i * 4 + 1], table[i * 4 + 2]]);
    expect(table.length).toBe(COLOR_STEPS * 4);
    for (let i = 1; i < COLOR_STEPS; i++) {
      // Neighbouring steps can round to the same bytes; none may be darker.
      expect([i, light(i) >= light(i - 1)]).toEqual([i, true]);
      expect(table[i * 4 + 3]).toBe(255);
      // Four steps apart is always visibly lighter.
      if (i >= 4) expect([i, light(i) > light(i - 4)]).toEqual([i, true]);
    }
  });

  it("runs from dark purple to bright yellow", () => {
    expect(colorAt(0)).toEqual([68, 1, 84]);
    expect(colorAt(1)).toEqual([253, 231, 37]);
    // Halfway is the teal anchor.
    expect(colorAt(0.5)).toEqual([33, 145, 140]);
    // Outside the scale, and not a number, clamp to an end.
    expect(colorAt(-3)).toEqual(colorAt(0));
    expect(colorAt(9)).toEqual(colorAt(1));
    expect(colorAt(NaN)).toEqual(colorAt(0));
    expect(luminance(colorAt(1))).toBeGreaterThan(8 * luminance(colorAt(0)));
  });

  it("paints the largest value (nearest) bright and the smallest dark", () => {
    const values = new Float32Array([2, 6, 4, 6]),
      out = colorize(values, 2, 6, new Uint8ClampedArray(16));
    expect([...out.slice(0, 4)]).toEqual([...colorAt(0), 255]);
    expect([...out.slice(4, 8)]).toEqual([...colorAt(1), 255]);
    expect([...out.slice(12, 16)]).toEqual([...colorAt(1), 255]);
    // The middle value lands on the middle of the table.
    const middle = Math.round(0.5 * (COLOR_STEPS - 1)) * 4,
      table = colorTable();
    expect([...out.slice(8, 11)]).toEqual([...table.slice(middle, middle + 3)]);
  });

  it("paints a map with one value everywhere as the dark end", () => {
    const out = colorize(
      new Float32Array([3, 3]),
      3,
      3,
      new Uint8ClampedArray(8),
    );
    expect([...out]).toEqual([...colorAt(0), 255, ...colorAt(0), 255]);
  });
});
