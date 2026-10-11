/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Numbers that rest on more than one picture. Every tapped point is a cloud:
// where each simulated retake of its own picture puts it on the floor. A
// point marked in two pictures is the two clouds weighted by how well each
// picture fixes it, and a wall, the perimeter and the floor area are worked
// out again in every retake, so each bar carries every picture it rests on.
// Pure: no DOM, no clock; the random numbers are seeded.
import { applyHomography, type Mat3, type Pt } from "../homography";
import { applyLens, type Lens } from "../lens";
import { gaussian, makeJitter, seededRandom } from "../monte-carlo";
import { polygonArea, selfIntersects } from "../shapes";
import { applyRigid, type Cov, type Rigid } from "./room-frame";

/** One picture's own map of the floor and its simulated retakes. */
export type ViewFrame = {
  id: number;
  /** The reference's corners in this picture's own frame, mm, in order. */
  plane: readonly Pt[];
  /** Picture pixels (after the lens correction) to that frame. */
  h: Mat3;
  lens: Lens | null;
  /** Tap uncertainty (one sd, source pixels) of a point that stored none. */
  sigma: number;
  /** The plane map each retake gave; null where it gave none. */
  trials: readonly (Mat3 | null)[];
};
/** Where a point is on a floor: from the taps as placed, and per retake. */
export type Sample = { at: Pt; trials: readonly (Pt | null)[] };
/** A retake must be usable this often for a number to be shown. */
export const KEEP = 0.8;

/** A point tapped in a picture, in that picture's own frame. `seed` names
 * the point, so its simulated taps do not depend on what else is marked.
 * Null when the point is at or beyond the horizon of the floor. */
export function sampleOf(
  frame: ViewFrame,
  tap: Pt,
  seed: number,
): Sample | null {
  const at = applyHomography(frame.h, applyLens(frame.lens, tap));
  if (!at) return null;
  const jitter = makeJitter(
    gaussian(seededRandom((frame.id * 7919 + seed * 104729 + 97) >>> 0)),
    frame.sigma,
    frame.lens,
  );
  return {
    at,
    trials: frame.trials.map((h) => {
      // Drawn for every retake, so retake i moves this point the same way
      // whatever happened to the retakes before it.
      const moved = jitter(tap);
      return h ? applyHomography(h, moved) : null;
    }),
  };
}

export const kept = (trials: readonly (unknown | null)[]): number =>
  trials.length ? trials.filter((t) => t !== null).length / trials.length : 0;

/** The spread of a cloud; null when too few retakes could place the point. */
export function covOf(s: Sample): Cov | null {
  const pts = s.trials.filter((p): p is Pt => p !== null),
    n = pts.length;
  if (n < 2 || n < KEEP * s.trials.length) return null;
  const mx = pts.reduce((t, p) => t + p.x, 0) / n,
    my = pts.reduce((t, p) => t + p.y, 0) / n;
  let xx = 0,
    xy = 0,
    yy = 0;
  for (const p of pts) {
    xx += (p.x - mx) ** 2;
    xy += (p.x - mx) * (p.y - my);
    yy += (p.y - my) ** 2;
  }
  const cov = { xx: xx / (n - 1), xy: xy / (n - 1), yy: yy / (n - 1) };
  return Number.isFinite(cov.xx + cov.xy + cov.yy) ? cov : null;
}

/** The same cloud in the room's frame. */
export const moved = (s: Sample, t: Rigid): Sample => ({
  at: applyRigid(t, s.at),
  trials: s.trials.map((p) => p && applyRigid(t, p)),
});

type M2 = [number, number, number, number];
const inv2 = (c: Cov): M2 | null => {
  const det = c.xx * c.yy - c.xy * c.xy;
  return det > 1e-12
    ? [c.yy / det, -c.xy / det, -c.xy / det, c.xx / det]
    : null;
};
const mul2 = (p: M2, q: M2): M2 => [
  p[0] * q[0] + p[1] * q[2],
  p[0] * q[1] + p[1] * q[3],
  p[2] * q[0] + p[3] * q[2],
  p[2] * q[1] + p[3] * q[3],
];

/** One point seen in several pictures (clouds already in the room's frame,
 * and independent of each other): each picture's estimate weighted by the
 * inverse of its spread, in the retakes as in the taps as placed. With one
 * cloud, that cloud. Null when a spread cannot be inverted. */
export function combine(
  seen: readonly { sample: Sample; cov: Cov }[],
): Sample | null {
  if (seen.length === 1) return seen[0].sample;
  const inv = seen.map((s) => inv2(s.cov));
  if (!seen.length || inv.some((m) => !m)) return null;
  const sum = (inv as M2[]).reduce(
      (t, m) => [t[0] + m[0], t[1] + m[1], t[2] + m[2], t[3] + m[3]] as M2,
    ),
    total = inv2({ xx: sum[0], xy: sum[1], yy: sum[3] });
  if (!total) return null;
  const weights = (inv as M2[]).map((m) => mul2(total, m)),
    mix = (pts: readonly (Pt | null)[]): Pt | null => {
      let x = 0,
        y = 0;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i],
          w = weights[i];
        if (!p) return null;
        x += w[0] * p.x + w[1] * p.y;
        y += w[2] * p.x + w[3] * p.y;
      }
      return { x, y };
    };
  return {
    at: mix(seen.map((s) => s.sample.at))!,
    trials: seen[0].sample.trials.map((_, i) =>
      mix(seen.map((s) => s.sample.trials[i])),
    ),
  };
}

/** A value and its bar (2 sd over the retakes), in mm or mm squared, with
 * the share of retakes that could produce it. */
export type Quantity = { value: number; error: number; kept: number };

/** `value(points)` on the taps as placed, and its spread over the retakes.
 * Null when fewer than 80% of the retakes place every point. */
export function quantity(
  points: readonly Sample[],
  value: (pts: Pt[]) => number,
): Quantity | null {
  const n = points[0]?.trials.length ?? 0,
    got: number[] = [];
  for (let i = 0; i < n; i++) {
    const pts = points.map((p) => p.trials[i]);
    if (pts.some((p) => !p)) continue;
    const v = value(pts as Pt[]);
    if (Number.isFinite(v)) got.push(v);
  }
  if (got.length < 2 || got.length < KEEP * n) return null;
  const mean = got.reduce((t, v) => t + v, 0) / got.length,
    sd = Math.sqrt(
      got.reduce((t, v) => t + (v - mean) ** 2, 0) / (got.length - 1),
    );
  return {
    value: value(points.map((p) => p.at)),
    error: 2 * sd,
    kept: got.length / n,
  };
}

const span = (pts: Pt[]) =>
  Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
const round = (pts: Pt[], closed: boolean) => {
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) t += span([pts[i], pts[i + 1]]);
  return closed ? t + span([pts[pts.length - 1], pts[0]]) : t;
};

export type OutlineNumbers = {
  /** Wall i runs from corner i to corner i + 1; the last closes the room. */
  walls: (Quantity | null)[];
  /** The perimeter of a closed outline, or the length so far of an open one. */
  length: Quantity | null;
  /** Closed outlines only; null when it crosses itself or is open. */
  area: Quantity | null;
  selfIntersecting: boolean;
};

/** Wall lengths, perimeter and floor area of an outline whose corners are
 * clouds in the room's frame, in order round the room. */
export function outlineNumbers(
  corners: readonly Sample[],
  closed: boolean,
): OutlineNumbers {
  const n = corners.length,
    sides = n < 2 ? 0 : closed ? n : n - 1,
    crossing = closed && n >= 3 && selfIntersects(corners.map((c) => c.at));
  return {
    walls: Array.from({ length: sides }, (_, i) =>
      quantity([corners[i], corners[(i + 1) % n]], span),
    ),
    length: n >= 2 ? quantity(corners, (pts) => round(pts, closed)) : null,
    area: closed && n >= 3 && !crossing ? quantity(corners, polygonArea) : null,
    selfIntersecting: crossing,
  };
}
