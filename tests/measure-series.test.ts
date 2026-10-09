/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe as suite, it, expect } from "vitest";
import { Series, describe } from "../src/measure/series";

suite("describe", () => {
  it("gives count, mean, sample sd, min and max", () => {
    const s = describe([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(s.count).toBe(8);
    expect(s.mean).toBe(5);
    // Population sd is 2; the sample sd (n - 1) is sqrt(32 / 7).
    expect(s.sd).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect([s.min, s.max]).toEqual([2, 9]);
  });
  it("skips non-finite values", () => {
    const s = describe([1, NaN, 3, Infinity]);
    expect([s.count, s.mean]).toEqual([2, 2]);
  });
  it("reports no data as NaN, never zero, and one sample has no sd", () => {
    expect(describe([])).toMatchObject({ count: 0 });
    expect(describe([]).mean).toBeNaN();
    const one = describe([4]);
    expect(one.mean).toBe(4);
    expect(one.sd).toBeNaN();
  });
});

suite("Series", () => {
  it("keeps only the newest samples once full", () => {
    const s = new Series(3);
    for (let i = 1; i <= 5; i++) s.push(i * 10, i);
    expect(s.size).toBe(3);
    expect(Array.from(s.samples().values)).toEqual([3, 4, 5]);
  });
  it("takes statistics over a trailing window", () => {
    const s = new Series(100);
    for (let i = 0; i < 10; i++) s.push(i * 1000, i);
    // The last 3 s before the newest sample (t = 9000): t = 6000..9000.
    const w = s.stats(3000);
    expect([w.count, w.mean, w.min, w.max]).toEqual([4, 7.5, 6, 9]);
    expect(s.stats().count).toBe(10);
    expect(s.stats(3000, 5000).max).toBe(5);
  });
  it("answers percentiles of a window", () => {
    const s = new Series(100);
    for (let i = 0; i <= 10; i++) s.push(i, i);
    expect(s.percentile(0.5)).toBe(5);
    expect(s.percentile(0.9)).toBeCloseTo(9);
    expect(s.percentile(0.5, 2)).toBe(9);
  });
  it("rejects non-finite samples and says so", () => {
    const s = new Series(4);
    expect(s.push(0, NaN)).toBe(false);
    expect(s.push(NaN, 1)).toBe(false);
    expect(s.push(0, 1)).toBe(true);
    expect(s.size).toBe(1);
  });
  it("is empty after clear, with NaN statistics", () => {
    const s = new Series(4);
    s.push(0, 1);
    s.clear();
    expect(s.size).toBe(0);
    expect(s.stats().mean).toBeNaN();
    expect(s.percentile(0.5)).toBeNaN();
  });
});
