/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Paths and outlines on the reference plane. Each value is the direct
// geometric value from the tapped points; its error is 2 standard deviations
// of the seeded Monte Carlo that perturbs every tapped point (the four
// reference corners and every vertex) and recomputes the value each time.
import {
  applyHomography,
  solveHomography,
  type Pt,
  type Sheet,
} from "./homography";
import { fusedRuns } from "./fused-trials";
import { applyLens, type Lens } from "./lens";
import {
  DEFAULT_SAMPLES,
  DEFAULT_SEED,
  gaussian,
  makeJitter,
  MIN_SAMPLES,
  seededRandom,
} from "./monte-carlo";

/** A direct value and its error (2 sd), in mm or mm squared. */
export type Quantity = { value: number; error: number };
export type ShapeResult = {
  /** The vertices on the plane, in mm, from the direct solve. */
  plane: Pt[];
  /** Each leg; an outline includes the closing leg. */
  legs: Quantity[];
  /** Path: total length. Outline: perimeter. */
  length: Quantity;
  /** Outlines only; null when the outline crosses itself. */
  area: Quantity | null;
  selfIntersecting: boolean;
  /** Share of simulated taps that could be used (1 means none dropped). */
  kept: number;
};

const cross = (o: Pt, a: Pt, b: Pt) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Do segments p1p2 and p3p4 cross properly (touching ends do not count)? */
function crosses(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = cross(p3, p4, p1),
    d2 = cross(p3, p4, p2),
    d3 = cross(p1, p2, p3),
    d4 = cross(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** True when two non-adjacent sides of the closed outline cross. */
export function selfIntersects(pts: Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent through the closing side
      if (crosses(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n]))
        return true;
    }
  return false;
}

/** Absolute area of a simple polygon (shoelace). */
export function polygonArea(pts: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export function legLengths(pts: Pt[], closed: boolean): number[] {
  const n = closed ? pts.length : pts.length - 1;
  return Array.from({ length: Math.max(0, n) }, (_, i) => {
    const a = pts[i],
      b = pts[(i + 1) % pts.length];
    return Math.hypot(a.x - b.x, a.y - b.y);
  });
}

/** Image points to plane points with the sheet's homography, after the lens
 * correction; null if any lies at or beyond the horizon. */
export function toPlane(
  h: Sheet["h"],
  pts: Pt[],
  lens: Lens | null,
): Pt[] | null {
  const out: Pt[] = [];
  for (const p of pts) {
    const q = applyHomography(h, applyLens(lens, p));
    if (!q) return null;
    out.push(q);
  }
  return out;
}

const cache = new Map<string, ShapeResult | null>();
const key = (p: Pt) => `${p.x},${p.y},${p.s ?? ""}`;

/** Measure a path (`closed` false) or an outline (`closed` true). Null when a
 * vertex is at or beyond the horizon, or the bar cannot be computed. */
export function measureShape(
  sheet: Sheet,
  pts: Pt[],
  closed: boolean,
  sigmaPx: number,
  lens: Lens | null = null,
  seed = DEFAULT_SEED,
  samples = DEFAULT_SAMPLES,
): ShapeResult | null {
  if (pts.length < (closed ? 3 : 2)) return null;
  const k = [
    ...(sheet.raw ?? sheet.ordered).map(key),
    sheet.plane[1].x,
    sheet.plane[2].y,
    sheet.fused?.key ?? "",
    lens ? `${lens.k}|${lens.cx}|${lens.cy}` : "",
    closed,
    sigmaPx,
    seed,
    samples,
    ...pts.map(key),
  ].join("|");
  if (cache.has(k)) return cache.get(k)!;
  const result = compute(sheet, pts, closed, sigmaPx, lens, seed, samples);
  if (cache.size > 300) cache.clear();
  cache.set(k, result);
  return result;
}

function compute(
  sheet: Sheet,
  pts: Pt[],
  closed: boolean,
  sigmaPx: number,
  lens: Lens | null,
  seed: number,
  samples: number,
): ShapeResult | null {
  const plane = toPlane(sheet.h, pts, lens);
  if (!plane) return null;
  const crossing = closed && selfIntersects(plane),
    withArea = closed && !crossing,
    legsDirect = legLengths(plane, closed),
    nLegs = legsDirect.length,
    n = Math.max(MIN_SAMPLES, Math.floor(samples)),
    normal = gaussian(seededRandom(seed)),
    // Noise first, then the lens correction, as a real tap would go.
    jitter = makeJitter(normal, sigmaPx, lens),
    base = sheet.raw ?? sheet.ordered,
    // Retakes of the whole fused solve, when there is more than one known size.
    runs = sheet.fused ? fusedRuns(sheet.fused, n) : null,
    // Sums for each leg, the total and the area: [sum, sum of squares].
    sums = Array.from({ length: nLegs + 2 }, () => [0, 0]);
  let used = 0;
  for (let t = 0; t < n; t++) {
    const h = runs
      ? (runs[t]?.h ?? null)
      : solveHomography(base.map(jitter), sheet.plane);
    if (!h) continue;
    const moved = toPlane(h, pts.map(jitter), null);
    if (!moved) continue;
    const legs = legLengths(moved, closed),
      total = legs.reduce((a, b) => a + b, 0),
      values = [...legs, total, withArea ? polygonArea(moved) : 0];
    if (!values.every(Number.isFinite)) continue;
    values.forEach((v, i) => {
      sums[i][0] += v;
      sums[i][1] += v * v;
    });
    used++;
  }
  if (used < 0.8 * n) return null;
  const sd = ([s, q]: number[]) =>
    Math.sqrt(Math.max(0, (q - (s * s) / used) / (used - 1)));
  return {
    plane,
    legs: legsDirect.map((value, i) => ({ value, error: 2 * sd(sums[i]) })),
    length: {
      value: legsDirect.reduce((a, b) => a + b, 0),
      error: 2 * sd(sums[nLegs]),
    },
    area: withArea
      ? { value: polygonArea(plane), error: 2 * sd(sums[nLegs + 1]) }
      : null,
    selfIntersecting: crossing,
    kept: used / n,
  };
}
