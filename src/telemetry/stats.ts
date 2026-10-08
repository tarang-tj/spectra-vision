/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pure statistics for the lab. No DOM, no clock: every function works only on
// the measured samples it is given, and reports "no data" as NaN instead of
// inventing a value.

/** The q-quantile (0..1) of the samples, by linear interpolation between the
 * two closest ranks. NaN for no samples; the sample itself for one. */
export function percentile(values: ArrayLike<number>, q: number): number {
  const n = values.length;
  if (!n) return NaN;
  const sorted = Float64Array.from(values).sort(),
    rank = Math.min(1, Math.max(0, q)) * (n - 1),
    low = Math.floor(rank),
    high = Math.ceil(rank);
  return sorted[low] + (sorted[high] - sorted[low]) * (rank - low);
}

export type Summary = {
  count: number;
  p50: number;
  p95: number;
  max: number;
};

/** Count, median, 95th percentile and maximum of the samples. */
export function summarize(values: ArrayLike<number>): Summary {
  const n = values.length;
  if (!n) return { count: 0, p50: NaN, p95: NaN, max: NaN };
  const sorted = Float64Array.from(values).sort();
  return {
    count: n,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[n - 1],
  };
}

/** Events per second across the span of the timestamps (ms): the number of
 * intervals divided by the time they cover. NaN with fewer than two
 * timestamps or a zero span, because one event has no rate. */
export function fpsFromTimestamps(times: ArrayLike<number>): number {
  const n = times.length;
  if (n < 2) return NaN;
  const span = times[n - 1] - times[0];
  return span > 0 ? ((n - 1) * 1000) / span : NaN;
}

/** Events per second for a fixed measuring period: count over duration. */
export function rate(count: number, durationMs: number): number {
  return durationMs > 0 ? (count * 1000) / durationMs : NaN;
}

/** A gap longer than this many typical frame intervals counts as a drop. */
export const DROP_FACTOR = 1.5;

export type Drops = {
  /** Frames that should have been drawn but were not. */
  dropped: number;
  /** The typical interval the gaps were compared with (median, ms). */
  interval: number;
};

/** Dropped-frame detection from draw timestamps (ms). The typical interval is
 * the median gap of the same samples; a gap longer than DROP_FACTOR times it
 * is counted as round(gap / interval) - 1 missing frames. Fewer than three
 * timestamps give no median to compare with, so nothing is reported. */
export function droppedFrames(times: ArrayLike<number>): Drops {
  const n = times.length;
  if (n < 3) return { dropped: 0, interval: NaN };
  const gaps = new Float64Array(n - 1);
  for (let i = 1; i < n; i++) gaps[i - 1] = times[i] - times[i - 1];
  const interval = percentile(gaps, 0.5);
  if (!(interval > 0)) return { dropped: 0, interval: NaN };
  let dropped = 0;
  for (let i = 0; i < gaps.length; i++)
    if (gaps[i] > interval * DROP_FACTOR)
      dropped += Math.round(gaps[i] / interval) - 1;
  return { dropped, interval };
}

/** A fixed-capacity ring of (time, value) samples. Pushing never allocates
 * and the oldest sample is overwritten, so a long session cannot grow it. */
export class SampleWindow {
  private readonly times: Float64Array;
  private readonly values: Float64Array;
  private head = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    this.times = new Float64Array(capacity);
    this.values = new Float64Array(capacity);
  }
  get size() {
    return this.count;
  }
  push(time: number, value: number) {
    this.times[this.head] = time;
    this.values[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }
  clear() {
    this.head = 0;
    this.count = 0;
  }
  /** Samples no older than `since`, oldest first, as two parallel arrays. */
  since(since: number): { times: Float64Array; values: Float64Array } {
    const start = (this.head - this.count + this.capacity) % this.capacity,
      times = new Float64Array(this.count),
      values = new Float64Array(this.count);
    let kept = 0;
    for (let i = 0; i < this.count; i++) {
      const at = (start + i) % this.capacity;
      if (this.times[at] < since) continue;
      times[kept] = this.times[at];
      values[kept++] = this.values[at];
    }
    return { times: times.subarray(0, kept), values: values.subarray(0, kept) };
  }
}
