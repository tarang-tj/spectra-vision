/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The arithmetic behind the stability meter. Pure: no DOM, no clock, no
// models. It works only on the positions it is given and reports "no data" as
// NaN, never as zero.
import type { Box } from "../../vision/types";

/** Every jitter figure covers exactly this much time, ending at the newest result. */
export const JITTER_WINDOW_MS = 3_000;
/** A point needs this many results in the window before it has a jitter. */
export const MIN_SAMPLES = 8;
/** Identity switches are counted over this much time. */
export const SWITCH_WINDOW_MS = 60_000;
/** The switch rate is shown only after this much tracking has been seen. */
export const MIN_SWITCH_OBSERVED_MS = 10_000;
/** A vanished track and a new one of the same label this close (as a fraction
 * of the image) and this soon are taken to be the same object. */
const SWITCH_DISTANCE = 0.12;
const SWITCH_GAP_MS = 2_000;

/** Parallel arrays; the samples before `start` are older than the window. */
type Trace = { t: number[]; x: number[]; y: number[]; start: number };
export type Jitter = {
  /** Mean over points of sqrt(var x + var y), in the unit the positions were given in. NaN: no data. */
  value: number;
  /** Points that had enough results in the window. */
  points: number;
  /** Results per point in the window, at most (the largest count of any point). */
  samples: number;
};
export const NO_JITTER: Jitter = { value: NaN, points: 0, samples: 0 };

/** Position spread of many points (landmarks, box centres) over a sliding
 * time window. For one point the figure is the root of the summed sample
 * variances of x and y, that is the radius of its scatter. A moving input
 * counts real motion as spread too: the figure is the spread of position, not
 * of error, and it is only a pure jitter on a still input. */
export class JitterWindow {
  private traces = new Map<string | number, Trace>();

  constructor(
    private readonly windowMs = JITTER_WINDOW_MS,
    private readonly minSamples = MIN_SAMPLES,
  ) {}

  reset() {
    this.traces.clear();
  }

  /** Add one position of point `key` seen at `time` (ms, not decreasing per key). */
  add(key: string | number, time: number, x: number, y: number) {
    if (!Number.isFinite(time) || !Number.isFinite(x) || !Number.isFinite(y))
      return;
    let trace = this.traces.get(key);
    if (!trace)
      this.traces.set(key, (trace = { t: [], x: [], y: [], start: 0 }));
    trace.t.push(time);
    trace.x.push(x);
    trace.y.push(y);
    const cut = time - this.windowMs;
    while (trace.start < trace.t.length - 1 && trace.t[trace.start] < cut)
      trace.start++;
    // Compact now and then, so a long run does not grow the arrays.
    if (trace.start >= 32 && trace.start * 2 > trace.t.length) {
      trace.t.splice(0, trace.start);
      trace.x.splice(0, trace.start);
      trace.y.splice(0, trace.start);
      trace.start = 0;
    }
  }

  /** The figure over the window ending at `now`. Points that have not been
   * seen in the window are forgotten. */
  measure(now: number): Jitter {
    const cut = now - this.windowMs;
    let sum = 0,
      points = 0,
      samples = 0;
    for (const [key, trace] of this.traces) {
      if (trace.t[trace.t.length - 1] < cut) {
        this.traces.delete(key);
        continue;
      }
      let first = trace.start;
      while (trace.t[first] < cut) first++;
      const n = trace.t.length - first;
      if (n < this.minSamples) continue;
      const spread = Math.sqrt(
        variance(trace.x, first) + variance(trace.y, first),
      );
      sum += spread;
      points++;
      samples = Math.max(samples, n);
    }
    return points ? { value: sum / points, points, samples } : NO_JITTER;
  }
}

/** Sample variance (n - 1) of values[from..]. */
function variance(values: number[], from: number): number {
  const n = values.length - from;
  if (n < 2) return 0;
  let mean = 0;
  for (let i = from; i < values.length; i++) mean += values[i];
  mean /= n;
  let sum = 0;
  for (let i = from; i < values.length; i++) sum += (values[i] - mean) ** 2;
  return sum / (n - 1);
}

type Seen = { label: string; x: number; y: number };
export type Identity = {
  switches: number;
  /** Seconds of tracking the count covers (at most the window). */
  observedMs: number;
  /** Switches per minute; NaN until enough tracking has been seen. */
  perMinute: number;
  /** Ids shown over the same period. */
  idsShown: number;
};

/** Counts identity switches in a stream of tracked objects without knowing
 * the truth: an id that has vanished and, within SWITCH_GAP_MS, a brand new id
 * of the same label that appears within SWITCH_DISTANCE of where it was last
 * seen. On a steady scene every such pair is one object whose track broke.
 * It also counts a genuine exit and a different entry at the same spot as a
 * switch, so on a moving input the figure is an upper bound. */
export class IdentityLog {
  private last = new Map<number, Seen>();
  private everSeen = new Set<number>();
  private gone: { id: number; at: Seen; time: number }[] = [];
  private events: number[] = [];
  private shown: number[] = [];
  private first = NaN;

  reset() {
    this.last.clear();
    this.everSeen.clear();
    this.gone = [];
    this.events = [];
    this.shown = [];
    this.first = NaN;
  }

  update(
    tracks: readonly { id: number; label: string; box: Box }[],
    time: number,
  ) {
    if (!Number.isFinite(time)) return;
    if (Number.isNaN(this.first)) this.first = time;
    const current = new Map<number, Seen>();
    for (const t of tracks)
      current.set(t.id, {
        label: t.label,
        x: t.box.x + t.box.w / 2,
        y: t.box.y + t.box.h / 2,
      });
    this.gone = this.gone.filter(
      (g) => time - g.time <= SWITCH_GAP_MS && !current.has(g.id),
    );
    for (const [id, at] of this.last)
      if (!current.has(id)) this.gone.push({ id, at, time });
    for (const [id, at] of current) {
      if (this.everSeen.has(id)) continue;
      this.everSeen.add(id);
      this.shown.push(time);
      const match = this.gone.findIndex(
        (g) =>
          g.at.label === at.label &&
          Math.hypot(g.at.x - at.x, g.at.y - at.y) < SWITCH_DISTANCE,
      );
      if (match >= 0) {
        this.gone.splice(match, 1);
        this.events.push(time);
      }
    }
    this.last = current;
    const cut = time - SWITCH_WINDOW_MS;
    while (this.events.length && this.events[0] < cut) this.events.shift();
    while (this.shown.length && this.shown[0] < cut) this.shown.shift();
  }

  measure(now: number): Identity {
    const observedMs = Number.isNaN(this.first)
      ? 0
      : Math.min(SWITCH_WINDOW_MS, now - this.first);
    const cut = now - SWITCH_WINDOW_MS,
      switches = this.events.filter((t) => t >= cut).length;
    return {
      switches,
      observedMs,
      perMinute:
        observedMs >= MIN_SWITCH_OBSERVED_MS
          ? (switches * 60_000) / observedMs
          : NaN,
      idsShown: this.shown.filter((t) => t >= cut).length,
    };
  }
}
