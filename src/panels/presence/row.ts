/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Measured } from "../../measure/noise";
import { MAX_STEP_MS } from "./types";
import type { Stamped } from "./types";

/** One line of the summary. `measured` is null when the inputs were not seen:
 * the panel then says "not seen" and `reason` says why. Never a zero stand-in. */
export type MetricRow = {
  id: string;
  label: string;
  measured: Measured | null;
  /** Low and high value when the error is a recomputation with a moved threshold. */
  range?: [number, number];
  reason?: string;
  /** Shares only: the time the share is a share of. `seenMs` is the time the
   * thing was seen, `coveredMs` the time the task ran. */
  denominator?: { what: string; seenMs: number; coveredMs: number };
  /** Raw counts and time beside a rate, for example "1 start in 3 s". */
  detail?: string;
};

/** "of the 31 s of 60 s a face was seen" */
export const denominatorText = (d: NonNullable<MetricRow["denominator"]>) =>
  `of the ${(d.seenMs / 1000).toFixed(1)} s of ${(d.coveredMs / 1000).toFixed(1)} s ${d.what}`;

export const notSeen = (
  id: string,
  label: string,
  reason: string,
): MetricRow => ({
  id,
  label,
  measured: null,
  reason,
});

/** Time each sample stands for: the step from the previous sample, or 0 for the
 * first sample and after a gap longer than MAX_STEP_MS. Times must not decrease. */
export function weights(times: readonly number[]): number[] {
  return times.map((t, i) => {
    const dt = i ? t - times[i - 1] : 0;
    return dt > 0 && dt <= MAX_STEP_MS ? dt : 0;
  });
}

export const sum = (values: readonly number[]) =>
  values.reduce((s, v) => s + v, 0);

/** Share (0..100) of the weighted time in which `test` holds, plus the one-result
 * interval that stands for the sampling resolution. NaN when no time is covered. */
export function share(
  w: readonly number[],
  test: (i: number) => boolean,
): { percent: number; step: number } {
  const total = sum(w);
  if (!(total > 0)) return { percent: NaN, step: NaN };
  let inside = 0,
    steps = 0;
  w.forEach((weight, i) => {
    if (weight > 0) steps++;
    if (weight > 0 && test(i)) inside += weight;
  });
  return {
    percent: (100 * inside) / total,
    step: 100 / steps,
  };
}

/** Largest distance from `value` to either end of `[lo, hi]`. */
export const halfRange = (value: number, lo: number, hi: number) =>
  Math.max(Math.abs(hi - value), Math.abs(value - lo));

/** The range a recomputation spans, always containing the nominal value (a count
 * of starts is not monotone in its threshold, so the ends alone may not). */
export const spread = (
  value: number,
  a: number,
  b: number,
): [number, number] => [Math.min(value, a, b), Math.max(value, a, b)];

/** The seen samples of a task with the time each stands for, taken from a chain
 * that includes the results that saw nothing. A sample is credited the step
 * from the previous result only when that result also saw the thing, so time
 * after a loss is never credited to the direction the thing reappears in. */
export function seenChain<T>(items: readonly Stamped<T>[]): {
  samples: T[];
  w: number[];
  seenMs: number;
  coveredMs: number;
} {
  const samples: T[] = [],
    w: number[] = [];
  let covered = 0;
  items.forEach((item, i) => {
    const dt = i ? item.t - items[i - 1].t : 0,
      step = dt > 0 && dt <= MAX_STEP_MS ? dt : 0;
    covered += step;
    if (item.s) {
      samples.push(item.s);
      w.push(i && items[i - 1].s ? step : 0);
    }
  });
  return { samples, w, seenMs: sum(w), coveredMs: covered };
}
