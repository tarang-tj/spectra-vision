/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The lens fit against tap noise. Pictures here are made with an independent
// forward model (a polynomial in the undistorted radius, the usual camera
// model), not with the code's own inverse.
import { describe, it, expect } from "vitest";
import type { Pt } from "../src/panels/ruler/homography";
import { fitRadial, K_MIN } from "../src/panels/ruler/lens";

const W = 1280,
  H = 720,
  SIGMA = 1.5;
const cx = W / 2,
  cy = H / 2,
  norm = Math.hypot(W, H) / 2;

/** A camera with radial coefficient `a`: d_distorted = d_ideal (1 + a r^2). */
const distort = (p: Pt, a: number): Pt => {
  const dx = p.x - cx,
    dy = p.y - cy,
    f = 1 + (a * (dx * dx + dy * dy)) / (norm * norm);
  return { x: cx + dx * f, y: cy + dy * f };
};
function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return () => Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u());
}
const LINES: [Pt, Pt][] = [
  [
    { x: 90, y: 70 },
    { x: 1190, y: 90 },
  ],
  [
    { x: 80, y: 650 },
    { x: 1200, y: 630 },
  ],
  [
    { x: 150, y: 40 },
    { x: 130, y: 690 },
  ],
];
/** Taps along the first `edges` lines, `n` points each, bent by `a`, with
 * Gaussian tap noise. */
function taps(
  edges: number,
  n: number,
  a: number,
  normal: () => number,
): Pt[][] {
  return LINES.slice(0, edges).map(([p, q]) =>
    Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1),
        d = distort({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, a);
      return { x: d.x + SIGMA * normal(), y: d.y + SIGMA * normal() };
    }),
  );
}

/** Share of seeded tappings in which the fit would be applied. */
function appliedShare(edges: number, n: number, a: number, trials: number) {
  const normal = rng(20261009);
  let applied = 0;
  const ks: number[] = [];
  for (let t = 0; t < trials; t++) {
    const fit = fitRadial(taps(edges, n, a, normal), W, H, SIGMA)!;
    if (fit.improved) {
      applied++;
      ks.push(fit.k);
    }
  }
  return { share: applied / trials, ks };
}

describe("lens fit against tap noise", () => {
  it("rarely accepts a fit on truly straight edges with 1.5 px tap noise", () => {
    // The old rule accepted 56 to 285 of 400 of these. At most 2% is stated.
    for (const [edges, n] of [
      [2, 4],
      [2, 6],
      [3, 5],
    ] as const) {
      const { share, ks } = appliedShare(edges, n, 0, 400);
      expect(share).toBeLessThanOrEqual(0.02);
      // Whatever is accepted is small, never a large wrong coefficient.
      ks.forEach((k) => expect(Math.abs(k)).toBeLessThan(0.1));
    }
  });
  it("accepts and helps when the picture really is distorted", () => {
    // A barrel lens, a = -0.15, so the correction is about +0.15.
    const normal = rng(7);
    let applied = 0,
      helped = 0;
    const trials = 200;
    for (let t = 0; t < trials; t++) {
      const fit = fitRadial(taps(3, 6, -0.15, normal), W, H, SIGMA)!;
      if (!fit.improved) continue;
      applied++;
      if (fit.after < fit.before * 0.5 && fit.k > 0.1) helped++;
    }
    expect(applied / trials).toBeGreaterThan(0.95);
    expect(helped).toBe(applied);
  });
  it("accepts the minimum number of points only for a strong bend", () => {
    const strong = appliedShare(2, 4, -0.2, 200).share;
    expect(strong).toBeGreaterThan(0.5);
  });
  it("says why when it does not apply, and refuses short edges", () => {
    const normal = rng(3);
    const flat = fitRadial(taps(3, 5, 0, normal), W, H, SIGMA)!;
    expect(flat.improved).toBe(false);
    expect(flat.reason).toMatch(/tap noise|clear enough|held-out|range/);
    const short = fitRadial(taps(2, 3, -0.2, normal), W, H, SIGMA)!;
    expect(short.improved).toBe(false);
    expect(short.reason).toMatch(/at least 4 points/);
  });
  it("never searches or accepts a coefficient where the map folds", () => {
    expect(K_MIN).toBeGreaterThan(-1 / 3);
    const normal = rng(5);
    for (const a of [0.4, 0.8, 1.2]) {
      const fit = fitRadial(taps(3, 6, a, normal), W, H, SIGMA)!;
      expect(fit.k).toBeGreaterThanOrEqual(K_MIN);
    }
    // So strong a barrel that the fit runs into the edge of the range: not applied.
    const wild = fitRadial(taps(3, 6, -0.3, normal), W, H, SIGMA)!;
    expect(wild.improved).toBe(false);
    expect(wild.reason).toMatch(/edge of the allowed range/);
  });
});
