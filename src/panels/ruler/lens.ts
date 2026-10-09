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
  /** True when the fit passed every test below and may be applied. */
  improved: boolean;
  /** Plain words for why a fit was not accepted, or null when it was. */
  reason: string | null;
  edges: number;
  points: number;
};

/** Fewest points on an edge that may be used. */
export const MIN_EDGE_POINTS = 4;
/** Fewest residual degrees of freedom (points minus 2 per edge) in total. */
export const MIN_DOF = 4;
/** The edges must be this many times straighter-looking than tap noise. */
export const NOISE_MARGIN = 2;
/** The fit must cut the error to at most this fraction of what it was. */
export const KEEP_BELOW_STRICT = 0.5;
/** The radial map r(1 + k r^2) stops being one-to-one inside the picture at
 * k = -1/3 (r is 1 at a corner), so the search stops short of it. */
export const K_MIN = -0.3;
export const K_MAX = K_LIMIT;

/** The k in [K_MIN, K_MAX] that makes `edges` straightest (grid, then golden
 * section). Pure search; no acceptance test. */
function bestK(edges: Pt[][], w: number, h: number): number {
  const f = (k: number) => straightness(edges, k, w, h),
    steps = 120,
    step = (K_MAX - K_MIN) / steps;
  let best = 0,
    bestF = Infinity;
  for (let i = 0; i <= steps; i++) {
    const k = K_MIN + i * step,
      v = f(k);
    if (v < bestF) {
      bestF = v;
      best = k;
    }
  }
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = Math.max(K_MIN, best - step),
    hi = Math.min(K_MAX, best + step),
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
  return (lo + hi) / 2;
}

/** Fit k, then decide whether it is more than a fit to tap noise. `sigma` is
 * the tap uncertainty (one sd, source pixels). A fit is accepted only if:
 * every edge has 4+ points and the edges leave 4+ degrees of freedom; the
 * edges are more than 2 sigma from straight to begin with; k is inside the
 * range where the map does not fold; the fit cuts the error to half or less;
 * and, for each edge in turn, the k fitted from the OTHER edges also makes
 * that held-out edge straighter. Null until there are two edges. */
export function fitRadial(
  edges: Pt[][],
  w: number,
  h: number,
  sigma = 1.5,
): LensFit | null {
  if (edges.length < 2 || !(w > 0) || !(h > 0)) return null;
  const used = edges.filter((e) => e.length >= MIN_EDGE_POINTS),
    points = edges.reduce((t, e) => t + e.length, 0),
    base = { edges: edges.length, points },
    none = (reason: string): LensFit => ({
      k: 0,
      before: 0,
      after: 0,
      improved: false,
      reason,
      ...base,
    });
  if (used.length < 2)
    return none(
      `Each edge needs at least ${MIN_EDGE_POINTS} points and at least 2 edges are needed.`,
    );
  const dof = used.reduce((t, e) => t + e.length - 2, 0);
  if (dof < MIN_DOF)
    return none("Too few points to tell a lens from tap noise. Add points.");
  const k = bestK(used, w, h),
    before = straightness(used, 0, w, h),
    after = straightness(used, k, w, h),
    out = (reason: string | null): LensFit => ({
      k,
      before,
      after,
      improved: reason === null,
      reason,
      ...base,
    });
  if (before <= NOISE_MARGIN * sigma)
    return out(
      `The edges are only ${before.toFixed(1)} px from straight, within the tap noise (${(NOISE_MARGIN * sigma).toFixed(1)} px). There is no lens bend to correct.`,
    );
  if (k <= K_MIN + 0.01 || k >= K_MAX - 0.01)
    return out(
      "The best fit is at the edge of the allowed range, so it is not a lens effect.",
    );
  if (!(after <= before * KEEP_BELOW_STRICT))
    return out(
      `The fit leaves the edges ${after.toFixed(1)} px from straight against ${before.toFixed(1)} px, not a clear enough improvement.`,
    );
  for (let i = 0; i < used.length; i++) {
    const rest = used.filter((_, j) => j !== i),
      kRest =
        rest.reduce((t, e) => t + e.length - 2, 0) >= 2 ? bestK(rest, w, h) : 0,
      held = [used[i]];
    if (!(straightness(held, kRest, w, h) < straightness(held, 0, w, h)))
      return out(
        "The fit from the other edges does not straighten one held-out edge, so the edges disagree about the lens.",
      );
  }
  return out(null);
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
