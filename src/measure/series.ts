/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A fixed-capacity time series with windowed statistics. The ring and the
// percentile come from the lab's telemetry code; nothing here is duplicated.
import { SampleWindow, percentile } from "../telemetry/stats";

export type SeriesStats = {
  count: number;
  mean: number;
  /** Sample standard deviation (n - 1). NaN with fewer than two samples. */
  sd: number;
  min: number;
  max: number;
};

const EMPTY: SeriesStats = {
  count: 0,
  mean: NaN,
  sd: NaN,
  min: NaN,
  max: NaN,
};

/** Count, mean, sample standard deviation, minimum and maximum, by Welford's
 * method. Non-finite values are skipped, so one bad sample cannot poison the
 * result. No data is reported as NaN, never as zero. */
export function describe(values: ArrayLike<number>): SeriesStats {
  let count = 0,
    mean = 0,
    m2 = 0,
    min = Infinity,
    max = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    count++;
    const delta = v - mean;
    mean += delta / count;
    m2 += delta * (v - mean);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!count) return { ...EMPTY };
  return {
    count,
    mean,
    sd: count > 1 ? Math.sqrt(m2 / (count - 1)) : NaN,
    min,
    max,
  };
}

/** (time, value) samples in a ring: the oldest is overwritten when it is full.
 * Times must not decrease from one push to the next.
 * A window is the last `spanMs` before the newest sample (or before `now`). */
export class Series {
  private readonly ring: SampleWindow;
  private newest = -Infinity;

  constructor(readonly capacity: number) {
    this.ring = new SampleWindow(capacity);
  }

  get size() {
    return this.ring.size;
  }

  /** Add a sample. Returns false, and stores nothing, for a non-finite value
   * or time. */
  push(time: number, value: number): boolean {
    if (!Number.isFinite(time) || !Number.isFinite(value)) return false;
    this.ring.push(time, value);
    if (time > this.newest) this.newest = time;
    return true;
  }

  clear() {
    this.ring.clear();
    this.newest = -Infinity;
  }

  /** Samples with `now - spanMs <= time <= now`, oldest first, as parallel
   * arrays. */
  samples(spanMs = Infinity, now = this.newest) {
    const all = this.ring.since(now - spanMs);
    let end = all.times.length;
    while (end > 0 && all.times[end - 1] > now) end--;
    return {
      times: all.times.subarray(0, end),
      values: all.values.subarray(0, end),
    };
  }

  stats(spanMs = Infinity, now = this.newest): SeriesStats {
    return describe(this.samples(spanMs, now).values);
  }

  /** The q-quantile (0..1) of the window, NaN when it is empty. */
  percentile(q: number, spanMs = Infinity, now = this.newest): number {
    return percentile(this.samples(spanMs, now).values, q);
  }
}
