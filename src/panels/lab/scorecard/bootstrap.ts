/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Intervals for the scorecard. The unit that is redrawn is the whole picture:
// boxes in one picture are found or missed together, so redrawing single
// boxes would state too narrow a range. Pure: no DOM, no clock, and the only
// randomness is a seeded generator, so one run always gives one interval.
import { percentile } from "../../../telemetry/stats";
import { seededRandom } from "../../ruler/monte-carlo";

export const RESAMPLES = 2000;
export const SEED = 20261012;
/** Under this many labelled objects behind a figure, no figure is stated. */
export const MIN_OBJECTS = 20;
/** With more than this share of resamples having no value, no interval is. */
export const MAX_SKIPPED = 0.05;

/** A figure worked out from the pictures, each counted `weights[i]` times;
 * with no weights, each once. Null when it has no value (nothing to divide
 * by). */
export type Statistic = (weights?: ArrayLike<number>) => number | null;

/** `resamples` draws of `pictures` pictures with replacement. Each draw is
 * how many times each picture was picked. */
export function drawWeights(
  pictures: number,
  resamples = RESAMPLES,
  seed = SEED,
): Uint16Array[] {
  const random = seededRandom(seed);
  return Array.from({ length: resamples }, () => {
    const draw = new Uint16Array(pictures);
    for (let i = 0; i < pictures; i++) draw[Math.floor(random() * pictures)]++;
    return draw;
  });
}

/** The 2.5th and 97.5th percentiles: where 95 of 100 values fall. */
export function intervalOf(values: ArrayLike<number>) {
  return { lo: percentile(values, 0.025), hi: percentile(values, 0.975) };
}

/** Wilson's 95% score interval for `successes` of `total`. Unlike the normal
 * approximation it stays inside 0 to 1 and has a width at 0% and 100%. */
export function wilson(successes: number, total: number) {
  const z = 1.959963984540054,
    p = successes / total,
    centre = p + (z * z) / (2 * total),
    spread =
      z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total)),
    scale = 1 + (z * z) / total;
  return {
    lo: successes === 0 ? 0 : (centre - spread) / scale,
    hi: successes === total ? 1 : (centre + spread) / scale,
  };
}

export type Figure = {
  /** The figure on the pictures as they are; null when it has no value. */
  value: number | null;
  lo: number | null;
  hi: number | null;
  /** How the interval was made; "none" when none is stated. */
  basis: "bootstrap" | "wilson" | "none";
  /** Resamples left out because the figure had no value in them. */
  skipped: number;
  /** For a Wilson interval: the number of objects it is over. */
  over?: number;
};
/** For a proportion: the counts a Wilson interval can be worked out from. */
export type Count = { successes: number; total: number };

/** The statistic on resamples `from` up to `to`. The caller can ask for a
 * slice at a time and let the page breathe between slices. */
export function resample(
  statistic: Statistic,
  weights: readonly ArrayLike<number>[],
  from = 0,
  to = weights.length,
): (number | null)[] {
  const values: (number | null)[] = [];
  for (let i = from; i < Math.min(to, weights.length); i++)
    values.push(statistic(weights[i]));
  return values;
}

/** A figure and its interval from the resampled values. No interval when the
 * figure has no value or too many resamples had none. When every resample
 * agrees the percentile interval would have no width, which overstates what
 * is known: then the Wilson interval over `count` is given instead, or none
 * where there is no count. */
export function figureFrom(
  value: number | null,
  resampled: readonly (number | null)[],
  count?: Count,
): Figure {
  const values = resampled.filter((v): v is number => v !== null),
    skipped = resampled.length - values.length,
    none: Figure = { value, lo: null, hi: null, basis: "none", skipped };
  if (value === null || !values.length) return none;
  if (skipped > resampled.length * MAX_SKIPPED) return none;
  const { lo, hi } = intervalOf(values);
  if (lo < hi) return { value, lo, hi, basis: "bootstrap", skipped };
  if (!count || !(count.total > 0)) return none;
  return {
    value,
    ...wilson(count.successes, count.total),
    basis: "wilson",
    skipped,
    over: count.total,
  };
}

export const figureOf = (
  statistic: Statistic,
  weights: readonly ArrayLike<number>[],
  count?: Count,
): Figure => figureFrom(statistic(), resample(statistic, weights), count);

export type Difference = Figure & {
  /** "more" or "fewer" only when the interval leaves 0 out. */
  verdict: "more" | "fewer" | "cannot tell";
};

/** The paired difference from the two runs' resampled values, which must
 * come from the same draws in the same order: the difference is taken inside
 * each resample. A run against itself is exactly 0 (0 to 0). */
export function differenceFrom(
  value: number | null,
  first: readonly (number | null)[],
  second: readonly (number | null)[],
): Difference {
  const values: number[] = [];
  for (let i = 0; i < first.length; i++) {
    const a = first[i],
      b = second[i];
    if (a !== null && b !== null) values.push(a - b);
  }
  const skipped = first.length - values.length;
  if (value === null || !values.length || skipped > first.length * MAX_SKIPPED)
    return {
      value,
      lo: null,
      hi: null,
      basis: "none",
      skipped,
      verdict: "cannot tell",
    };
  const { lo, hi } = intervalOf(values),
    verdict = lo > 0 ? "more" : hi < 0 ? "fewer" : "cannot tell";
  return { value, lo, hi, basis: "bootstrap", skipped, verdict };
}

/** `a` minus `b` on the same pictures, with the same draws given to both. */
export function pairedDifference(
  a: Statistic,
  b: Statistic,
  weights: readonly ArrayLike<number>[],
): Difference {
  const first = a(),
    second = b();
  return differenceFrom(
    first === null || second === null ? null : first - second,
    resample(a, weights),
    resample(b, weights),
  );
}
