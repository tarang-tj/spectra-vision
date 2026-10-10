/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The camera behind the Ruler's picture, and the same camera re-solved from
// jittered taps so that anything built on it can carry an honest error bar.
import { fitCamera, type Camera } from "../../measure/camera";
import type { Derived } from "./derive";
import { fusedRuns } from "./fused-trials";
import { solveHomography, type Mat3, type Pt } from "./homography";
import { applyLens } from "./lens";
import {
  DEFAULT_SEED,
  gaussian,
  makeJitter,
  seededRandom,
  TAP_SIGMA_SCREEN_PX,
} from "./monte-carlo";
import { allPlumbs, plumbVersion, type PlumbLine } from "./plumbs";
import type { RulerState } from "./state";

/** Tap uncertainty (one sd, source pixels) for a point that stored none. */
export const tapSigma = (s: RulerState): number =>
  TAP_SIGMA_SCREEN_PX / (s.scale > 0 ? s.scale : 1);

type Key = {
  sheet: Derived["sheet"];
  lens: Derived["lens"];
  source: RulerState["source"];
  plumbs: number;
};
const same = (a: Key, b: Key) =>
  a.sheet === b.sheet &&
  a.lens === b.lens &&
  a.source === b.source &&
  a.plumbs === b.plumbs;
const keyOf = (s: RulerState, d: Derived): Key => ({
  sheet: d.sheet,
  lens: d.lens,
  source: s.source,
  plumbs: plumbVersion(),
});

let camMemo: { key: Key; value: Camera | null } | null = null;

/** The camera for the current reference and plumb edges, or null until the
 * reference is solved. Memoized: cheap to call every frame. */
export function cameraOf(s: RulerState, d: Derived): Camera | null {
  const key = keyOf(s, d);
  if (camMemo && same(camMemo.key, key)) return camMemo.value;
  let value: Camera | null = null;
  if (d.sheet && s.source) {
    const { sheet } = d;
    value = fitCamera({
      h: sheet.h,
      width: s.source.w,
      height: s.source.h,
      // With further known sizes fused in, the corners are where the fused
      // map puts them, so the camera agrees with `sheet.h`.
      seen: (sheet.fused?.corners ?? sheet.ordered).map((image, i) => ({
        plane: sheet.plane[i],
        image,
      })),
      plumbs: allPlumbs().map((l) => ({
        a: applyLens(d.lens, l.a),
        b: applyLens(d.lens, l.b),
      })),
    });
  }
  camMemo = { key, value };
  return value;
}

/** One simulated retake of the taps: the plane map and camera they would
 * have given. `seed` is this trial's own, for jittering further points
 * (`makeJitter(gaussian(seededRandom(trial.seed)), sigma, lens)`). */
export type Trial = { h: Mat3; camera: Camera | null; seed: number };
export type Trials = {
  trials: Trial[];
  /** Share of simulated retakes that gave a usable plane (1: none dropped). */
  kept: number;
};

export const DEFAULT_TRIALS = 200;
let trialMemo: { key: Key; n: number; value: Trials } | null = null;

/** The reference corners and plumb edges perturbed by their tap uncertainty
 * `n` times, each time re-solved. Seeded, so the same taps give the same
 * trials. Take 2 standard deviations of any quantity over `trials` as its
 * bar, exactly as the Ruler's spans do. Empty until the reference is solved. */
export function cameraTrials(
  s: RulerState,
  d: Derived,
  n = DEFAULT_TRIALS,
): Trials {
  const key = keyOf(s, d);
  if (trialMemo && trialMemo.n === n && same(trialMemo.key, key))
    return trialMemo.value;
  const value: Trials = { trials: [], kept: 0 },
    nominal = cameraOf(s, d);
  if (d.sheet && s.source) {
    const { sheet } = d,
      base = sheet.raw ?? sheet.ordered,
      plumbs = allPlumbs(),
      jitter = makeJitter(
        gaussian(seededRandom(DEFAULT_SEED)),
        tapSigma(s),
        d.lens,
      ),
      // Retakes of the whole fused solve when there are further known sizes.
      runs = sheet.fused ? fusedRuns(sheet.fused, n) : null;
    for (let i = 0; i < n; i++) {
      const corners = runs ? runs[i]?.corners : base.map(jitter),
        lines = plumbs.map((l: PlumbLine) => ({
          a: jitter(l.a),
          b: jitter(l.b),
        })),
        h = runs
          ? (runs[i]?.h ?? null)
          : corners && solveHomography(corners, sheet.plane);
      if (!h || !corners) continue;
      value.trials.push({
        h,
        camera: fitCamera({
          h,
          width: s.source.w,
          height: s.source.h,
          seen: corners.map((image: Pt, k) => ({
            plane: sheet.plane[k],
            image,
          })),
          plumbs: lines,
          near: nominal ?? undefined,
        }),
        seed: DEFAULT_SEED + 1 + i,
      });
    }
    value.kept = value.trials.length / n;
  }
  trialMemo = { key, n, value };
  return value;
}
