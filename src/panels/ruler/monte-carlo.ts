/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The error bar. The four reference corners and both endpoints are perturbed
// with Gaussian noise of one tap uncertainty (in source pixels), the distance
// is recomputed each time, and the spread of those distances is the bar. The
// random numbers are seeded, so the same taps always give the same bar.
import { measured, type Measured } from "../../measure/noise";
import { fromMm, type Unit } from "./units";
import {
  planeDistance,
  solveHomography,
  type Pt,
  type Sheet,
} from "./homography";

/** What the bar covers, word for word. It is shown beside every result. */
export const BASIS =
  "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.";

export const MIN_SAMPLES = 300;
export const DEFAULT_SAMPLES = 400;
export const DEFAULT_SEED = 20261008;
/** Default tap uncertainty: how far a tap may land from where it was meant,
 * in screen pixels, before it is converted through the display scale. */
export const TAP_SIGMA_SCREEN_PX = 1.5;

/** Small, fast, seedable generator (mulberry32): uniform in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal draws (Box-Muller) from a uniform generator. */
export function gaussian(random: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = 1 - random(), // (0, 1], so log is finite
      r = Math.sqrt(-2 * Math.log(u)),
      t = 2 * Math.PI * random();
    spare = r * Math.sin(t);
    return r * Math.cos(t);
  };
}

export type Spread = { mean: number; sd: number; used: number };

/** Distances in mm over `samples` perturbed trials. Trials whose corners tip
 * into a degenerate shape are dropped; null when fewer than 80% survive. */
export function distanceSpread(
  sheet: Sheet,
  a: Pt,
  b: Pt,
  sigmaPx: number,
  seed = DEFAULT_SEED,
  samples = DEFAULT_SAMPLES,
): Spread | null {
  const n = Math.max(MIN_SAMPLES, Math.floor(samples)),
    normal = gaussian(seededRandom(seed)),
    // Each point carries the tap uncertainty it was placed with.
    jitter = (p: Pt): Pt => {
      const sd = p.s ?? sigmaPx;
      return { x: p.x + sd * normal(), y: p.y + sd * normal() };
    };
  let sum = 0,
    sumSq = 0,
    used = 0;
  for (let i = 0; i < n; i++) {
    const h = solveHomography(sheet.ordered.map(jitter), sheet.plane),
      d = h ? planeDistance(h, jitter(a), jitter(b)) : null;
    if (d === null || !Number.isFinite(d)) continue;
    used++;
    sum += d;
    sumSq += d * d;
  }
  if (used < 0.8 * n) return null;
  const mean = sum / used,
    variance = Math.max(0, (sumSq - used * mean * mean) / (used - 1));
  return { mean, sd: Math.sqrt(variance), used };
}

export type Span = { mm: number; errorMm: number; measured: Measured };

const key = (p: Pt) => `${p.x},${p.y},${p.s ?? ""}`;
const cache = new Map<string, { mm: number; errorMm: number } | null>();

/** One measurement in `unit`: the direct plane distance between the two taps,
 * with 2 standard deviations of the perturbed samples as its bar. (The mean of
 * the samples is biased upward, so it is not the value.) Null when a point is
 * at or beyond the horizon, or the bar is unusable. Results are memoized per
 * measurement, so dragging one point does not rerun the others. */
export function measureSpan(
  sheet: Sheet,
  a: Pt,
  b: Pt,
  sigmaPx: number,
  unit: Unit,
  seed = DEFAULT_SEED,
  samples = DEFAULT_SAMPLES,
): Span | null {
  const k = [
    ...sheet.ordered.map(key),
    sheet.plane[1].x,
    sheet.plane[2].y,
    key(a),
    key(b),
    sigmaPx,
    seed,
    samples,
  ].join("|");
  let hit = cache.get(k);
  if (hit === undefined) {
    const mm = planeDistance(sheet.h, a, b),
      s =
        mm === null
          ? null
          : distanceSpread(sheet, a, b, sigmaPx, seed, samples);
    hit = mm !== null && s ? { mm, errorMm: 2 * s.sd } : null;
    if (cache.size > 500) cache.clear();
    cache.set(k, hit);
  }
  if (!hit) return null;
  return {
    ...hit,
    measured: measured(
      fromMm(hit.mm, unit),
      fromMm(hit.errorMm, unit),
      unit,
      BASIS,
    ),
  };
}
