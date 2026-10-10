/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// From relative to metric depth. The depth model's output is inverse depth up
// to an unknown scale and shift, so for points whose real depth is known
//   1 / depth = a * output + b
// holds for one pair (a, b). This file finds that pair by robust least squares
// and refuses when the known points cannot pin both numbers down. Pure.

export type FitSample = {
  /** The model's output at the point. */
  output: number;
  /** The point's real depth along the camera's axis, in any length unit. */
  depth: number;
};

export type FitRefusal =
  /** Fewer usable points than MIN_FIT_POINTS. */
  | "few"
  /** The points sit at nearly one depth: scale and shift cannot be told apart. */
  | "span"
  /** The model's output is the same at every point. */
  | "flat"
  /** The model reads the nearer points as farther. */
  | "inverted"
  /** The fit leaves more than MAX_RESIDUAL of scatter. */
  | "scatter";

export type DepthFit = {
  ok: true;
  /** 1 / depth = a * output + b, in the unit of the samples' depths. */
  a: number;
  b: number;
  /** Points used, after the ones the robust fit set aside. */
  used: number;
  /** Root mean square of (fitted depth - real depth) / real depth over the
   * points used. */
  residual: number;
  /** The 5th and 95th percentile of the samples' real depths. */
  near: number;
  far: number;
};
export type FitFailure = {
  ok: false;
  reason: FitRefusal;
  count: number;
  near: number;
  far: number;
  /** The scatter the refused fit left, when it got that far. */
  residual?: number;
};

export const MIN_FIT_POINTS = 30;
/** The far points must be at least this many times as deep as the near ones.
 * Under it, a wrong shift can be made up for by a wrong scale. */
export const MIN_DEPTH_RATIO = 1.3;
export const MAX_RESIDUAL = 0.25;

const percentile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];

/** Weighted straight line y = a * x + b, or null when x does not vary. */
function line(
  x: Float64Array,
  y: Float64Array,
  w: Float64Array,
): { a: number; b: number } | null {
  let sw = 0,
    sx = 0,
    sy = 0;
  for (let i = 0; i < x.length; i++) {
    sw += w[i];
    sx += w[i] * x[i];
    sy += w[i] * y[i];
  }
  if (!(sw > 0)) return null;
  const mx = sx / sw,
    my = sy / sw;
  let sxx = 0,
    sxy = 0;
  for (let i = 0; i < x.length; i++) {
    const dx = x[i] - mx;
    sxx += w[i] * dx * dx;
    sxy += w[i] * dx * (y[i] - my);
  }
  if (!(sxx > 1e-12 * Math.max(1, mx * mx) * sw)) return null;
  const a = sxy / sxx;
  return { a, b: my - a * mx };
}

/** Fit scale and shift. Points that sit far from the line (a chair standing
 * on the outlined floor) are weighted down, then left out. */
export function fitDepth(samples: readonly FitSample[]): DepthFit | FitFailure {
  const good = samples.filter(
      (s) =>
        Number.isFinite(s.output) && Number.isFinite(s.depth) && s.depth > 0,
    ),
    depths = good.map((s) => s.depth).sort((p, q) => p - q),
    count = good.length,
    near = count ? percentile(depths, 0.05) : NaN,
    far = count ? percentile(depths, 0.95) : NaN,
    refuse = (reason: FitRefusal, residual?: number): FitFailure => ({
      ok: false,
      reason,
      count,
      near,
      far,
      residual,
    });
  if (count < MIN_FIT_POINTS) return refuse("few");
  if (!(far / near >= MIN_DEPTH_RATIO)) return refuse("span");
  const x = Float64Array.from(good, (s) => s.output),
    y = Float64Array.from(good, (s) => 1 / s.depth),
    w = new Float64Array(count).fill(1);
  let fit = line(x, y, w);
  if (!fit) return refuse("flat");
  // Three Huber rounds pull the line toward the bulk of the points; the
  // rounds after them drop what is still far off, so a one-sided group of
  // wrong points cannot drag the line.
  for (let round = 0; round < 8; round++) {
    const errors = Array.from(x, (v, i) =>
        Math.abs(fit!.a * v + fit!.b - y[i]),
      ),
      // The median error, scaled to a standard deviation for normal noise.
      scale =
        1.4826 *
        percentile(
          [...errors].sort((p, q) => p - q),
          0.5,
        ),
      soft = round < 3,
      bound = (soft ? 1.5 : 3) * Math.max(scale, 1e-12 * Math.abs(fit.b));
    for (let i = 0; i < count; i++)
      w[i] = errors[i] <= bound ? 1 : soft ? bound / errors[i] : 0;
    const next = line(x, y, w);
    if (!next) break;
    fit = next;
  }
  if (!(fit.a > 0)) return refuse("inverted");
  // Scatter in depth, over the points the robust fit kept at full weight.
  let sum = 0,
    used = 0;
  for (let i = 0; i < count; i++) {
    const inverse = fit.a * x[i] + fit.b;
    if (w[i] < 1 || !(inverse > 0)) continue;
    const relative = 1 / inverse / good[i].depth - 1;
    sum += relative * relative;
    used++;
  }
  if (used < MIN_FIT_POINTS) return refuse("scatter");
  const residual = Math.sqrt(sum / used);
  if (!(residual <= MAX_RESIDUAL)) return refuse("scatter", residual);
  return { ok: true, a: fit.a, b: fit.b, used, residual, near, far };
}

/** The depth the fit gives a model output, or null where the fitted inverse
 * depth is not positive (farther than the fit can place). */
export const depthAt = (
  fit: { a: number; b: number },
  output: number,
): number | null => {
  const inverse = fit.a * output + fit.b;
  return inverse > 0 ? 1 / inverse : null;
};
