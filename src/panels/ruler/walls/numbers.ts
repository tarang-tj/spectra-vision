/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls numbers and their bars. Each value is the direct geometric value
// from the taps. Its bar is 2 standard deviations over the Ruler's simulated
// retakes: every trial has its own plane map and camera (from jittered
// reference corners and plumb edges), and the floor and ceiling taps are
// jittered again inside it before every quantity is derived afresh.
import type { Camera } from "../../../measure/camera";
import type { Trial } from "../camera-of";
import type { Mat3, Pt } from "../homography";
import { applyLens, type Lens } from "../lens";
import { gaussian, makeJitter, seededRandom } from "../monte-carlo";
import { solveShell, type Shell } from "./shell";
import type { Corner } from "./store";

/** A value and its bar (2 sd), in mm, mm2 or mm3. */
export type Q = { value: number; error: number };

export type Numbers = {
  /** The shell from the taps as placed. */
  shell: Shell;
  walls: (Q | null)[];
  /** Per corner; null where no ceiling point was tapped or no bar exists. */
  heights: (Q | null)[];
  meanHeight: Q | null;
  floorArea: Q | null;
  wallArea: Q | null;
  volume: Q | null;
  /** Simulated retakes asked for, and the smallest share any shown number
   * could use. */
  trials: number;
  kept: number;
  /** The shown numbers that some retakes could not produce, by name, in the
   * order the panel lists them. Empty when `kept` is 1. */
  partial: string[];
};

export type NumbersInput = {
  h: Mat3;
  camera: Camera | null;
  lens: Lens | null;
  trials: readonly Trial[];
  corners: readonly Corner[];
  closed: boolean;
  /** Tap uncertainty (one sd, source px) for a point that stored none. */
  sigma: number;
};

/** A number is shown only if this share of the retakes could produce it. */
const MIN_KEPT = 0.8;

/** What each number of `flatten` is called in the panel, in the same order. */
const names = (s: Shell): string[] => [
  ...s.walls.map((_, i) => `the length of wall ${i + 1}`),
  ...s.heights.map((_, i) => `the height at corner ${i + 1}`),
  "the ceiling height",
  "the floor area",
  "the wall area",
  "the volume",
];

/** Every number of a shell in one fixed order, so trials line up. */
const flatten = (s: Shell): (number | null)[] => [
  ...s.walls,
  ...s.heights,
  s.meanHeight,
  s.floorArea,
  s.wallArea,
  s.volume,
];

export function measureWalls(input: NumbersInput): Numbers | null {
  const { h, camera, lens, trials, corners, closed, sigma } = input,
    shell = solveShell({
      h,
      camera,
      base: corners.map((c) => applyLens(lens, c.base)),
      top: corners.map((c) => (c.top ? applyLens(lens, c.top) : null)),
      closed,
    });
  if (!shell) return null;
  const direct = flatten(shell),
    n = direct.map(() => 0),
    sum = direct.map(() => 0),
    sumSq = direct.map(() => 0);
  for (const trial of trials) {
    const jitter = makeJitter(gaussian(seededRandom(trial.seed)), sigma, lens),
      // Every tap is drawn in the same order whatever the result, so one
      // trial's noise does not depend on another corner's outcome.
      base = corners.map((c) => jitter(c.base)),
      top = corners.map((c): Pt | null => (c.top ? jitter(c.top) : null)),
      got = solveShell({ h: trial.h, camera: trial.camera, base, top, closed });
    if (!got) continue;
    flatten(got).forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      n[i]++;
      sum[i] += v;
      sumSq[i] += v * v;
    });
  }
  let kept = 1;
  const partial: string[] = [],
    called = names(shell),
    need = Math.max(2, MIN_KEPT * trials.length),
    q = direct.map((value, i): Q | null => {
      if (value === null || n[i] < need) return null;
      const mean = sum[i] / n[i],
        variance = Math.max(0, (sumSq[i] - n[i] * mean * mean) / (n[i] - 1));
      kept = Math.min(kept, n[i] / trials.length);
      if (n[i] < trials.length) partial.push(called[i]);
      return { value, error: 2 * Math.sqrt(variance) };
    }),
    w = shell.walls.length,
    c = corners.length;
  return {
    shell,
    walls: q.slice(0, w),
    heights: q.slice(w, w + c),
    meanHeight: q[w + c],
    floorArea: q[w + c + 1],
    wallArea: q[w + c + 2],
    volume: q[w + c + 3],
    trials: trials.length,
    kept,
    partial,
  };
}
