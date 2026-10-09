/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  combineErrors,
  isMeasured,
  measured,
  noiseFloor,
} from "../src/measure/noise";

describe("noiseFloor", () => {
  it("gives the standard deviation and peak to peak of a still interval", () => {
    const n = noiseFloor([10.1, 9.9, 10.0, 10.2, 9.8]);
    expect(n.count).toBe(5);
    expect(n.peakToPeak).toBeCloseTo(0.4, 12);
    expect(n.sd).toBeCloseTo(Math.sqrt(0.1 / 4), 12);
  });
  it("is zero for a perfectly steady signal", () => {
    expect(noiseFloor([3, 3, 3, 3])).toEqual({
      count: 4,
      sd: 0,
      peakToPeak: 0,
    });
  });
  it("is NaN, not zero, with fewer than two usable samples", () => {
    expect(noiseFloor([]).sd).toBeNaN();
    expect(noiseFloor([5]).peakToPeak).toBeNaN();
    expect(noiseFloor([5, NaN]).sd).toBeNaN();
  });
});

describe("Measured", () => {
  const m = measured(12.3, 0.4, "cm", "tap placement only");
  it("carries value, error, unit and basis", () => {
    expect(m).toEqual({
      value: 12.3,
      error: 0.4,
      unit: "cm",
      basis: "tap placement only",
    });
  });
  it("is measured only when value and error are real", () => {
    expect(isMeasured(m)).toBe(true);
    expect(isMeasured({ ...m, value: NaN })).toBe(false);
    expect(isMeasured({ ...m, error: NaN })).toBe(false);
    expect(isMeasured({ ...m, error: -1 })).toBe(false);
  });
  it("adds independent errors in quadrature", () => {
    expect(combineErrors(3, 4)).toBe(5);
    expect(combineErrors(2)).toBe(2);
    expect(combineErrors(1, NaN)).toBeNaN();
  });
});
