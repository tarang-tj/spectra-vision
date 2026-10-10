/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The error bar. The four reference corners and both endpoints are perturbed
// with Gaussian noise of one tap uncertainty (in source pixels), the distance
// is recomputed each time, and the spread of those distances is the bar. The
// random numbers are seeded, so the same taps always give the same bar.
import { measured, type Measured } from "../../measure/noise";
import { fromMm, type Unit } from "./units";
import { fusedRuns } from "./fused-trials";
import { applyLens, type Lens } from "./lens";
import {
  planeDistance,
  solveHomography,
  type Pt,
  type Sheet,
} from "./homography";

/** What the bar covers, word for word. It is shown beside every result. */
export const BASIS =
  "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.";

/** The same, when a one-parameter lens correction was applied to every point. */
export const BASIS_LENS =
  "Tap placement only, after a one-parameter lens correction applied to every point. Not included: remaining lens distortion, points off the surface, a bent or misprinted reference.";
export const basisFor = (lens: Lens | null): string =>
  lens ? BASIS_LENS : BASIS;

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

/** A tap perturbation: Gaussian noise of the point's own stored uncertainty
 * (or `sigmaPx`), then the lens correction, as the real measurement does. */
export function makeJitter(
  normal: () => number,
  sigmaPx: number,
  lens: Lens | null,
): (p: Pt) => Pt {
  return (p) => {
    const sd = p.s ?? sigmaPx;
    return applyLens(lens, { x: p.x + sd * normal(), y: p.y + sd * normal() });
  };
}

export type Spread = { mean: number; sd: number; used: number; kept: number };

/** Distances in mm over `samples` perturbed trials. Trials whose corners tip
 * into a degenerate shape are dropped; null when fewer than 80% survive. */
export function distanceSpread(
  sheet: Sheet,
  a: Pt,
  b: Pt,
  sigmaPx: number,
  seed = DEFAULT_SEED,
  samples = DEFAULT_SAMPLES,
  lens: Lens | null = null,
): Spread | null {
  const n = Math.max(MIN_SAMPLES, Math.floor(samples)),
    normal = gaussian(seededRandom(seed)),
    // Each point carries the tap uncertainty it was placed with.
    jitter = makeJitter(normal, sigmaPx, lens),
    base = sheet.raw ?? sheet.ordered,
    // With more than one known size, each trial is a retake of the whole
    // fused solve (made once and shared), not of the first reference alone.
    runs = sheet.fused ? fusedRuns(sheet.fused, n) : null;
  let sum = 0,
    sumSq = 0,
    used = 0;
  for (let i = 0; i < n; i++) {
    const h = runs
        ? (runs[i]?.h ?? null)
        : solveHomography(base.map(jitter), sheet.plane),
      d = h ? planeDistance(h, jitter(a), jitter(b)) : null;
    if (d === null || !Number.isFinite(d)) continue;
    used++;
    sum += d;
    sumSq += d * d;
  }
  if (used < 0.8 * n) return null;
  const mean = sum / used,
    variance = Math.max(0, (sumSq - used * mean * mean) / (used - 1));
  return { mean, sd: Math.sqrt(variance), used, kept: used / n };
}

export type Span = {
  mm: number;
  errorMm: number;
  measured: Measured;
  /** Share of simulated taps that could be used (1 means none dropped). */
  kept: number;
};

/** The sentence shown when some simulated taps had to be dropped. */
export const droppedNote = (kept: number): string =>
  `Only ${Math.floor(kept * 100)}% of the simulated taps could be used; the rest put a point at or beyond the horizon or gave no flat surface. The bar is a lower bound here, so do not read this value as precise.`;

const key = (p: Pt) => `${p.x},${p.y},${p.s ?? ""}`;
const cache = new Map<
  string,
  { mm: number; errorMm: number; kept: number } | null
>();

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
  lens: Lens | null = null,
): Span | null {
  const k = [
    ...(sheet.raw ?? sheet.ordered).map(key),
    lens ? `${lens.k}|${lens.cx}|${lens.cy}` : "",
    sheet.plane[1].x,
    sheet.plane[2].y,
    sheet.fused?.key ?? "",
    key(a),
    key(b),
    sigmaPx,
    seed,
    samples,
  ].join("|");
  let hit = cache.get(k);
  if (hit === undefined) {
    const mm = planeDistance(sheet.h, applyLens(lens, a), applyLens(lens, b)),
      s =
        mm === null
          ? null
          : distanceSpread(sheet, a, b, sigmaPx, seed, samples, lens);
    hit = mm !== null && s ? { mm, errorMm: 2 * s.sd, kept: s.kept } : null;
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
      basisFor(lens),
    ),
  };
}
