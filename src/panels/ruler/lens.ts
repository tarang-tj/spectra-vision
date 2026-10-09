/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One-parameter radial lens correction, fitted from edges the user says are
// straight in reality (the plumb-line method). Pure: no DOM, no clock.
//
// A tapped point p is moved to c + (p - c) * (1 + k * r^2), where c is the
// picture centre and r is the distance from c in units of the half diagonal.
// The principal point is assumed to be the centre; a real lens is off by a
// little, and that is one of the things the correction leaves out.
import type { Pt } from "./homography";

export type Lens = { k: number; cx: number; cy: number; norm: number };

/** The coefficient is searched in this range. A fit that lands on the edge of
 * it is not a lens effect and is not used. */
export const K_LIMIT = 0.6;
/** A fit is kept only if it cuts the straightness error to this fraction. */
export const KEEP_BELOW = 0.9;
/** Edges already straighter than this (source pixels) have nothing to fix. */
export const MIN_BEFORE_PX = 0.1;

export const lensFor = (k: number, w: number, h: number): Lens => ({
  k,
  cx: w / 2,
  cy: h / 2,
  norm: Math.hypot(w, h) / 2,
});

/** Correct one point (its stored tap uncertainty rides along). */
export function applyLens(lens: Lens | null, p: Pt): Pt {
  if (!lens || lens.k === 0) return p;
  const dx = p.x - lens.cx,
    dy = p.y - lens.cy,
    r2 = (dx * dx + dy * dy) / (lens.norm * lens.norm),
    f = 1 + lens.k * r2,
    out: Pt = { x: lens.cx + dx * f, y: lens.cy + dy * f };
  return p.s === undefined ? out : { ...out, s: p.s };
}

/** Sum of squared perpendicular distances of points from their best-fit
 * straight line (total least squares): the smaller eigenvalue of the scatter. */
function lineResidual(pts: Pt[]): number {
  const n = pts.length,
    mx = pts.reduce((s, p) => s + p.x, 0) / n,
    my = pts.reduce((s, p) => s + p.y, 0) / n;
  let a = 0,
    b = 0,
    c = 0;
  for (const p of pts) {
    const dx = p.x - mx,
      dy = p.y - my;
    a += dx * dx;
    b += dx * dy;
    c += dy * dy;
  }
  return Math.max(0, (a + c) / 2 - Math.sqrt(((a - c) / 2) ** 2 + b * b));
}

/** RMS perpendicular distance, in source pixels, of the edges' points from
 * their own straight lines once corrected by `k`. The corrected points are
 * rescaled to the mean radius they had, because a correction that merely
 * shrinks the picture would otherwise look straighter. */
export function straightness(
  edges: Pt[][],
  k: number,
  w: number,
  h: number,
): number {
  const lens = lensFor(k, w, h),
    all = edges.flat(),
    radius = (pts: Pt[]) =>
      pts.reduce((s, p) => s + Math.hypot(p.x - lens.cx, p.y - lens.cy), 0) /
      pts.length;
  const before = radius(all),
    fixed = edges.map((e) => e.map((p) => applyLens(lens, p))),
    after = radius(fixed.flat()),
    back = after > 0 ? before / after : 1;
  let sum = 0;
  for (const e of fixed)
    sum += lineResidual(
      e.map((p) => ({
        x: lens.cx + (p.x - lens.cx) * back,
        y: lens.cy + (p.y - lens.cy) * back,
      })),
    );
  return Math.sqrt(sum / all.length);
}

export type LensFit = {
  k: number;
  /** Straightness error with no correction and with `k`, source pixels. */
  before: number;
  after: number;
  /** True when the fit cuts the error enough to be worth applying. */
  improved: boolean;
  edges: number;
  points: number;
};

/** Fit k. Null until there are two edges of three or more points each. */
export function fitRadial(edges: Pt[][], w: number, h: number): LensFit | null {
  const good = edges.filter((e) => e.length >= 3);
  if (good.length < 2 || !(w > 0) || !(h > 0)) return null;
  const f = (k: number) => straightness(good, k, w, h),
    steps = 120,
    step = (2 * K_LIMIT) / steps;
  let best = 0,
    bestF = Infinity;
  for (let i = 0; i <= steps; i++) {
    const k = -K_LIMIT + i * step,
      v = f(k);
    if (v < bestF) {
      bestF = v;
      best = k;
    }
  }
  // Golden-section refinement inside the best grid cell.
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = Math.max(-K_LIMIT, best - step),
    hi = Math.min(K_LIMIT, best + step),
    x1 = hi - g * (hi - lo),
    x2 = lo + g * (hi - lo),
    f1 = f(x1),
    f2 = f(x2);
  for (let i = 0; i < 60; i++) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = f(x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = f(x2);
    }
  }
  const k = (lo + hi) / 2,
    before = f(0),
    after = f(k),
    atBound = Math.abs(k) > K_LIMIT - 2 * step;
  return {
    k,
    before,
    after,
    improved: !atBound && before > MIN_BEFORE_PX && after < before * KEEP_BELOW,
    edges: good.length,
    points: good.reduce((s, e) => s + e.length, 0),
  };
}

/** The tapped (distorted) position that `applyLens` would move to `q`.
 * Fixed-point iteration; converges for the small coefficients allowed here. */
export function invertLens(lens: Lens | null, q: Pt): Pt {
  if (!lens || lens.k === 0) return q;
  let x = q.x,
    y = q.y;
  for (let i = 0; i < 20; i++) {
    const dx = x - lens.cx,
      dy = y - lens.cy,
      f = 1 + (lens.k * (dx * dx + dy * dy)) / (lens.norm * lens.norm);
    x = lens.cx + (q.x - lens.cx) / f;
    y = lens.cy + (q.y - lens.cy) / f;
  }
  return { x, y };
}
