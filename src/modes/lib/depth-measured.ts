/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The error bar of a metric depth. The Ruler's taps are uncertain, so its
// plane and camera are too: each simulated retake of the taps (the Ruler's
// own `cameraTrials`) gives the marked floor other depths and so another fit.
// A depth's bar is 2 standard deviations over those fits, combined with twice
// the scatter the fit leaves on the marked floor.
import { combineErrors, measured, type Measured } from "../../measure/noise";
import { cameraTrials } from "../../panels/ruler/camera-of";
import { depthAt, fitDepth } from "../../vision/depth/affine-fit";
import { samplesFor } from "./depth-floor";
import type { MetricScale } from "./depth-metric";

/** Most floor cells refitted in each retake. */
const MAX_RETAKE_CELLS = 500;
/** The retakes are worked out only once the same scale has been asked for
 * this many times (the stage asks once per drawn frame), so dragging a Ruler
 * handle does not refit two hundred cameras on every move. */
const SETTLE_ASKS = 8;

/** One retake's fit, and the near and far depth it gave the marked floor. */
type Retake = { a: number; b: number; near: number; far: number };
type Retakes = { asks: number; fits: Retake[] | null };
const store = new WeakMap<MetricScale, Retakes>();

function refit(scale: MetricScale): Retake[] {
  const step = Math.max(1, Math.ceil(scale.cells.length / MAX_RETAKE_CELLS)),
    cells = scale.cells.filter((_, i) => i % step === 0),
    fits: Retake[] = [];
  for (const trial of cameraTrials(scale.s, scale.d).trials) {
    if (!trial.camera) continue;
    const fit = fitDepth(samplesFor(cells, trial.h, trial.camera));
    if (fit.ok) fits.push(fit);
  }
  return fits;
}

/** The retakes, or null until the scale has settled. */
function retakesOf(scale: MetricScale): Retake[] | null {
  let entry = store.get(scale);
  if (!entry) store.set(scale, (entry = { asks: 0, fits: null }));
  if (!entry.fits) {
    if (++entry.asks < SETTLE_ASKS) return null;
    entry.fits = refit(scale);
  }
  return entry.fits;
}

/** Sample standard deviation, NaN with fewer than two values. */
function spread(values: number[]): number {
  const n = values.length,
    mean = values.reduce((sum, v) => sum + v, 0) / n;
  return Math.sqrt(
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1),
  );
}
/** A depth whose bar is wider than this share of it is not shown. */
export const MAX_RELATIVE_BAR = 0.5;
/** Fewest retakes that must have given a fit for a bar to be stated. */
const MIN_RETAKES = 20;

/** How far the near and the far end of the marked floor are from the camera
 * (the 5th and 95th percentile of its cells), in metres. This is the Ruler's
 * own geometry: no depth model is involved. "pending" until settled. */
export function floorSpan(
  scale: MetricScale,
): { near: Measured; far: Measured } | "pending" | null {
  const fits = retakesOf(scale);
  if (!fits) return "pending";
  if (fits.length < MIN_RETAKES) return null;
  const basis = `From the Ruler's plane and camera. The bar is 2 standard deviations over ${fits.length} simulated retakes of the Ruler's taps; it leaves out lens distortion that was not corrected.`,
    one = (value: number, values: number[]) =>
      measured(value / 1000, (2 * spread(values)) / 1000, "m", basis);
  return {
    near: one(
      scale.fit.near,
      fits.map((f) => f.near),
    ),
    far: one(
      scale.fit.far,
      fits.map((f) => f.far),
    ),
  };
}

export const depthBasis = (scale: MetricScale, retakes: number) =>
  `Depth along the camera's axis. The bar is 2 standard deviations over ${retakes} simulated retakes of the Ruler's taps, combined with twice the scatter of the fit on the marked floor (${(scale.fit.residual * 100).toFixed(1)}%). It leaves out the depth model's own error away from that floor.`;

/** The depth at a model output, in metres with its bar. "pending" while the
 * retakes are not worked out yet; null where the fit cannot place the output
 * (too far past the marked floor: no positive depth, or a bar wider than
 * half of it), or too few retakes gave a fit to state a bar. */
export function measuredDepth(
  scale: MetricScale,
  output: number,
): Measured | "pending" | null {
  const fits = retakesOf(scale);
  if (!fits) return "pending";
  const value = depthAt(scale.fit, output);
  if (value === null || fits.length < MIN_RETAKES) return null;
  const depths: number[] = [];
  for (const fit of fits) {
    const depth = depthAt(fit, output);
    if (depth !== null) depths.push(depth);
  }
  // A depth most retakes cannot place has no bar worth stating.
  if (depths.length < 0.8 * fits.length) return null;
  const error = combineErrors(
    2 * spread(depths),
    2 * scale.fit.residual * value,
  );
  // Far past the marked floor the fitted inverse depth nears zero and the
  // depth is anyone's guess: a bar wider than half the depth is not a reading.
  if (!(error <= MAX_RELATIVE_BAR * value)) return null;
  return measured(
    value / 1000,
    error / 1000,
    "m",
    depthBasis(scale, fits.length),
  );
}
