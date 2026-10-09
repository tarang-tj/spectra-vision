/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The One Euro filter (Casiez, Roussel and Vogel, 2012): a low-pass filter whose
// cutoff rises with the signal's speed, so a still landmark is steady and a fast
// one still follows. Pure and time-aware: it works from the timestamps it is
// given, never from a clock, and it never changes its input.
import type { Point } from "../vision/types";

export type OneEuroOptions = {
  /** Cutoff in Hz when the signal is still. Lower is steadier. */
  minCutoff?: number;
  /** How much the cutoff grows per unit of speed (units per second). */
  beta?: number;
  /** Cutoff in Hz of the speed estimate itself. */
  derivativeCutoff?: number;
  /** A gap longer than this (ms) between samples starts the filter again. */
  maxGapMs?: number;
};

// Tuned for image-normalized landmarks (0..1): a hand crossing the frame in one
// second has a speed of about 1.
export const ONE_EURO_DEFAULTS: Required<OneEuroOptions> = {
  minCutoff: 1.2,
  beta: 12,
  derivativeCutoff: 1,
  maxGapMs: 500,
};

/** Weight of the newest sample for a low-pass at `cutoff` Hz and step `dt` s. */
const factor = (cutoff: number, dt: number) => {
  const r = 2 * Math.PI * cutoff * dt;
  return r / (r + 1);
};

/** One scalar signal. */
export class OneEuroFilter {
  private readonly o: Required<OneEuroOptions>;
  private raw = NaN;
  private smooth = NaN;
  private slope = 0;
  private time = NaN;

  constructor(options: OneEuroOptions = {}) {
    this.o = { ...ONE_EURO_DEFAULTS, ...options };
  }

  /** Forget the history: the next sample passes through unchanged. */
  reset() {
    this.raw = this.smooth = this.time = NaN;
    this.slope = 0;
  }

  /** The filtered value for `value` seen at `timeMs`. A non-finite sample is
   * returned as it is and leaves the filter untouched. Time that stands still
   * returns the last output; time that runs backwards or jumps past
   * `maxGapMs` restarts the filter on this sample. */
  filter(value: number, timeMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timeMs)) return value;
    const gap = timeMs - this.time;
    if (!Number.isFinite(gap) || gap < 0 || gap > this.o.maxGapMs) {
      this.raw = this.smooth = value;
      this.slope = 0;
      this.time = timeMs;
      return value;
    }
    if (gap === 0) return this.smooth;
    const dt = gap / 1000;
    const speed = (value - this.raw) / dt;
    this.slope += factor(this.o.derivativeCutoff, dt) * (speed - this.slope);
    const cutoff = this.o.minCutoff + this.o.beta * Math.abs(this.slope);
    this.smooth += factor(cutoff, dt) * (value - this.smooth);
    this.raw = value;
    this.time = timeMs;
    return this.smooth;
  }
}

type Axes = { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter };

/** One list of landmarks (one body, one hand, one face). The filters are
 * rebuilt when the number of points changes. Returns new points; `visibility`
 * is passed through unfiltered and `z` is filtered only where it is present. */
export class LandmarkSmoother {
  private axes: Axes[] = [];

  constructor(private readonly options: OneEuroOptions = {}) {}

  reset() {
    this.axes = [];
  }

  smooth(points: readonly Point[], timeMs: number): Point[] {
    if (points.length !== this.axes.length)
      this.axes = points.map(() => ({
        x: new OneEuroFilter(this.options),
        y: new OneEuroFilter(this.options),
        z: new OneEuroFilter(this.options),
      }));
    return points.map((p, i) => {
      const out: Point = {
        x: this.axes[i].x.filter(p.x, timeMs),
        y: this.axes[i].y.filter(p.y, timeMs),
      };
      if (p.z !== undefined) out.z = this.axes[i].z.filter(p.z, timeMs);
      if (p.visibility !== undefined) out.visibility = p.visibility;
      return out;
    });
  }
}

/** Several lists at once (two hands, two faces). A list keeps its filters only
 * while it keeps its `key` (for hands, the handedness label), so two hands that
 * swap places in the output are never blended into each other. */
export class LandmarkSetSmoother {
  private lists: { key: string; smoother: LandmarkSmoother }[] = [];

  constructor(private readonly options: OneEuroOptions = {}) {}

  reset() {
    this.lists = [];
  }

  smooth(
    sets: readonly (readonly Point[])[],
    timeMs: number,
    keys: readonly string[] = [],
  ): Point[][] {
    this.lists.length = Math.min(this.lists.length, sets.length);
    return sets.map((points, i) => {
      const key = keys[i] ?? "";
      let list = this.lists[i];
      if (!list || list.key !== key)
        list = this.lists[i] = {
          key,
          smoother: new LandmarkSmoother(this.options),
        };
      return list.smoother.smooth(points, timeMs);
    });
  }
}
