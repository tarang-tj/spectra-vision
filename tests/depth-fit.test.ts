/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  depthAt,
  fitDepth,
  MIN_FIT_POINTS,
  type FitSample,
} from "../src/vision/depth/affine-fit";

// Seeded noise, so a failure repeats.
function normal(seed: number) {
  let state = seed;
  const uniform = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state + 0.5) / 4294967296;
  };
  return () =>
    Math.sqrt(-2 * Math.log(uniform())) * Math.cos(2 * Math.PI * uniform());
}

const A = 3e-4,
  B = 8e-5;
/** Points between 1 m and 5 m whose output hides the depth behind A and B,
 * with noise on the inverse depth as a share of it. */
function samples(count: number, noiseShare: number, seed = 7): FitSample[] {
  const noise = normal(seed);
  return Array.from({ length: count }, (_, i) => {
    const depth = 1000 + (4000 * i) / (count - 1),
      inverse = (1 / depth) * (1 + noiseShare * noise());
    return { output: (inverse - B) / A, depth };
  });
}

describe("the scale and shift fit", () => {
  it("recovers a known scale and shift exactly from clean points", () => {
    const fit = fitDepth(samples(200, 0));
    if (!fit.ok) throw new Error(fit.reason);
    expect(fit.a / A).toBeCloseTo(1, 9);
    expect(fit.b / B).toBeCloseTo(1, 9);
    expect(fit.residual).toBeLessThan(1e-9);
    expect(fit.used).toBe(200);
    // The 5th and 95th percentile of depths spread evenly from 1 m to 5 m.
    expect(fit.near).toBeCloseTo(1000 + 4000 * (9 / 199), 6);
    expect(fit.far).toBeCloseTo(1000 + 4000 * (189 / 199), 6);
  });

  it("recovers them from noisy points and reports the scatter", () => {
    const fit = fitDepth(samples(1500, 0.02));
    if (!fit.ok) throw new Error(fit.reason);
    expect(Math.abs(fit.a / A - 1)).toBeLessThan(0.02);
    expect(Math.abs(fit.b / B - 1)).toBeLessThan(0.05);
    // 2% noise on inverse depth is about 2% scatter in depth; the points
    // weighted down are left out, so a little under.
    expect(fit.residual).toBeGreaterThan(0.01);
    expect(fit.residual).toBeLessThan(0.025);
    // A depth read back through the fit is within 2% of the truth.
    const output = (1 / 2500 - B) / A;
    expect(Math.abs(depthAt(fit, output)! / 2500 - 1)).toBeLessThan(0.02);
  });

  it("is not pulled off by a chair standing on the marked floor", () => {
    const clean = samples(600, 0.005),
      // One point in eight reads far nearer than the floor under it.
      spoiled = clean.map((s, i) =>
        i % 8 === 0 ? { ...s, output: s.output * 1.8 + 0.6 } : s,
      ),
      fit = fitDepth(spoiled);
    if (!fit.ok) throw new Error(fit.reason);
    expect(Math.abs(fit.a / A - 1)).toBeLessThan(0.03);
    expect(Math.abs(fit.b / B - 1)).toBeLessThan(0.08);
    expect(fit.used).toBeLessThan(spoiled.length);
  });

  it("refuses points that all sit at one depth", () => {
    const flatFloor = samples(300, 0.01).map((s) => ({ ...s, depth: 2000 })),
      fit = fitDepth(flatFloor);
    expect(fit).toMatchObject({ ok: false, reason: "span", count: 300 });
  });

  it("refuses a span of depths under 1.3 to 1 and accepts one over it", () => {
    const spanned = (far: number) =>
      Array.from({ length: 200 }, (_, i) => {
        const depth = 2000 + ((far - 2000) * i) / 199;
        return { output: (1 / depth - B) / A, depth };
      });
    // The 5th to 95th percentile span is what counts.
    expect(fitDepth(spanned(2500))).toMatchObject({
      ok: false,
      reason: "span",
    });
    expect(fitDepth(spanned(3000)).ok).toBe(true);
  });

  it("refuses too few points, a flat output and an inverted one", () => {
    expect(fitDepth(samples(MIN_FIT_POINTS - 1, 0))).toMatchObject({
      ok: false,
      reason: "few",
    });
    expect(
      fitDepth(samples(100, 0).map((s) => ({ ...s, output: 1.5 }))),
    ).toMatchObject({ ok: false, reason: "flat" });
    expect(
      fitDepth(samples(100, 0).map((s) => ({ ...s, output: -s.output }))),
    ).toMatchObject({ ok: false, reason: "inverted" });
  });

  it("refuses a map that does not follow the floor", () => {
    const noise = normal(3),
      wild = samples(400, 0).map((s) => ({
        ...s,
        output: s.output * (1 + 0.9 * noise()),
      })),
      fit = fitDepth(wild);
    expect(fit.ok).toBe(false);
    if (!fit.ok) expect(["scatter", "inverted"]).toContain(fit.reason);
  });

  it("skips points with no usable depth and gives no depth past the fit", () => {
    const fit = fitDepth([
      ...samples(100, 0),
      { output: 1, depth: NaN },
      { output: NaN, depth: 1000 },
      { output: 1, depth: -5 },
    ]);
    if (!fit.ok) throw new Error(fit.reason);
    expect(fit.used).toBe(100);
    // An output so small that the fitted inverse depth is not positive.
    expect(depthAt(fit, -B / A - 1)).toBeNull();
    expect(depthAt(fit, (1 / 4000 - B) / A)).toBeCloseTo(4000, 4);
  });
});
