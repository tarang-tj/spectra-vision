/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The bar on a clearance: the outline's taps moved through every simulated
// retake of the reference (camera-of.ts), the clearance taken again each
// time, and 2 standard deviations of those as the bar.
import { cameraTrials, tapSigma, type Trial } from "../camera-of";
import type { Derived } from "../derive";
import { applyHomography, type Pt } from "../homography";
import { gaussian, makeJitter, seededRandom } from "../monte-carlo";
import type { RulerState, Shape } from "../state";
import { clearance, sampleSd, type P } from "./geometry";

// The outline's corners on the plane in every trial. Kept per shape, so
// moving the box does not redo them.
type Scatter = { trials: readonly Trial[]; planes: (P[] | null)[] };
const scatterMemo = new WeakMap<Shape, Scatter>();

function scatter(
  shape: Shape,
  trials: readonly Trial[],
  s: RulerState,
  d: Derived,
): Scatter {
  const hit = scatterMemo.get(shape);
  if (hit && hit.trials === trials) return hit;
  const sigma = tapSigma(s),
    planes = trials.map((trial) => {
      // The trial's own seed, so each retake moves the outline's taps too.
      const jitter = makeJitter(
          gaussian(seededRandom(trial.seed)),
          sigma,
          d.lens,
        ),
        out: P[] = [];
      for (const tap of shape.pts) {
        const q = applyHomography(trial.h, jitter(tap));
        if (!q) return null;
        out.push(q);
      }
      return out;
    }),
    value = { trials, planes };
  scatterMemo.set(shape, value);
  return value;
}

/** Clearance of the footprint inside one outline, with its bar. Null when
 * too few simulated retakes kept the outline in front of the horizon. */
export function outlineClearance(
  foot: readonly P[],
  nominal: readonly Pt[],
  shape: Shape,
  s: RulerState,
  d: Derived,
): { mm: number; errorMm: number; kept: number; trials: number } | null {
  const { trials, kept } = cameraTrials(s, d);
  if (!trials.length) return null;
  const values: number[] = [];
  for (const plane of scatter(shape, trials, s, d).planes)
    if (plane) {
      const c = clearance(foot, plane);
      if (Number.isFinite(c)) values.push(c);
    }
  const share = (values.length / trials.length) * kept,
    mm = clearance(foot, nominal);
  if (share < 0.8 || !Number.isFinite(mm)) return null;
  return {
    mm,
    errorMm: 2 * sampleSd(values),
    kept: share,
    trials: values.length,
  };
}
