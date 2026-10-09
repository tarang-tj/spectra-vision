/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { formatMeasured, roundError } from "../src/measure/format";
import { measured } from "../src/measure/noise";

const f = (value: number, error: number, unit = "cm") =>
  formatMeasured(measured(value, error, unit, "test"));

describe("roundError", () => {
  it("keeps one significant figure", () => {
    expect(roundError(0.4)).toEqual({ error: 0.4, decimals: 1 });
    expect(roundError(0.0432).decimals).toBe(2);
    expect(roundError(37)).toEqual({ error: 40, decimals: -1 });
  });
  it("carries when rounding reaches the next place", () => {
    expect(roundError(0.96)).toEqual({ error: 1, decimals: 0 });
    expect(roundError(96)).toEqual({ error: 100, decimals: -2 });
  });
});

describe("formatMeasured", () => {
  it("writes the value to the decimal place of the error", () => {
    expect(f(12.34, 0.4)).toBe("12.3 ± 0.4 cm");
    expect(f(12.3456, 0.04)).toBe("12.35 ± 0.04 cm");
    expect(f(12.34, 0.96)).toBe("12 ± 1 cm");
    expect(f(5.04, 0.25)).toBe("5.0 ± 0.3 cm");
  });
  it("rounds large errors to tens and hundreds", () => {
    expect(f(1234, 37, "mm")).toBe("1230 ± 40 mm");
    expect(f(1234, 260, "mm")).toBe("1200 ± 300 mm");
  });
  it("never prints a negative zero", () => {
    expect(f(-0.02, 0.5, "")).toBe("0.0 ± 0.5");
  });
  it("sets degrees and percent against the number", () => {
    expect(f(30.2, 1.9, "°")).toBe("30 ± 2°");
    expect(f(41, 3, "%")).toBe("41 ± 3%");
  });
  it("writes an exactly-zero error as ± 0 with three figures", () => {
    expect(f(12.3456, 0)).toBe("12.3 ± 0 cm");
  });
  it("refuses a number without a usable error or value", () => {
    expect(f(NaN, 1)).toBe("not measured");
    expect(f(1, NaN)).toBe("not measured");
    expect(f(1, -0.1)).toBe("not measured");
    expect(f(1, Infinity)).toBe("not measured");
  });
});
