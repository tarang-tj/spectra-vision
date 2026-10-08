/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { telemetry } from "../../telemetry/bus";
import {
  SampleWindow,
  droppedFrames,
  fpsFromTimestamps,
  summarize,
} from "../../telemetry/stats";
import type { Summary } from "../../telemetry/stats";
import type { Delegate, TaskKind } from "../../vision/types";

/** Every live figure covers exactly this much time, ending now. */
export const WINDOW_MS = 10_000;
/** Each point of the frame-rate chart is the rate over this much time. */
export const RATE_SPAN_MS = 2_000;
/** Readouts and charts refresh this often while the stage is drawing. */
const REFRESH_MS = 250;
/** How much frame-rate history the chart keeps. */
export const HISTORY_MS = 30_000;

export type Samples = { times: Float64Array; values: Float64Array };
export type LabSnapshot = {
  /** Page time (performance.now) the snapshot was taken at. */
  now: number;
  /** Latency statistics of each task over the window. */
  latency: Partial<Record<TaskKind, Summary>>;
  /** Results per second of the mode's primary task over the window. */
  processedFps: number;
  /** Stage frames drawn per second over the window. */
  renderFps: number;
  /** Missing stage frames in the window, and the interval they were judged by. */
  dropped: number;
  frameInterval: number;
  /** The lab's own cost: mean and worst milliseconds per stage frame. */
  costMean: number;
  costMax: number;
};
export type LabStore = {
  latencySamples(kind: TaskKind, now: number): Samples;
  history(series: "processed" | "render", now: number): Samples;
  /** Stop listening. After this the store does no work at all. */
  close(): void;
};

/** Collects telemetry for one mode while the lab is open. It listens to the
 * bus and is driven by the stage's own frame events, so it owns no timer and
 * no animation loop: when the stage stops drawing, the lab stops too. All
 * buffers are fixed-size rings. */
export function openLabStore(
  kinds: TaskKind[],
  onRefresh: (snapshot: LabSnapshot, store: LabStore) => void,
): LabStore {
  const latency = new Map(
      kinds.map((kind) => [kind, new SampleWindow(512)] as const),
    ),
    frames = new SampleWindow(1024),
    processed = new SampleWindow(256),
    render = new SampleWindow(256);
  const ran = new Map<TaskKind, Delegate>();
  let lastRefresh = 0,
    cost = 0,
    costMax = 0,
    frameCount = 0;

  const refresh = (now: number) => {
    const since = now - WINDOW_MS,
      primary = latency.get(kinds[0])!,
      drawn = frames.since(since).times,
      drops = droppedFrames(drawn),
      snapshot: LabSnapshot = {
        now,
        latency: {},
        processedFps: fpsFromTimestamps(primary.since(since).times),
        renderFps: fpsFromTimestamps(drawn),
        dropped: drops.dropped,
        frameInterval: drops.interval,
        costMean: frameCount ? cost / frameCount : NaN,
        costMax,
      };
    for (const [kind, samples] of latency)
      snapshot.latency[kind] = summarize(samples.since(since).values);
    // One chart point per refresh: the measured rate over the last 2 s.
    const span = now - RATE_SPAN_MS,
      p = fpsFromTimestamps(primary.since(span).times),
      r = fpsFromTimestamps(frames.since(span).times);
    if (Number.isFinite(p)) processed.push(now, p);
    if (Number.isFinite(r)) render.push(now, r);
    onRefresh(snapshot, store);
  };
  const offInference = telemetry.on("inference", (event) => {
    const started = performance.now(),
      samples = latency.get(event.kind);
    // Figures never mix two delegates: a switch or a fallback starts afresh.
    if (samples && ran.get(event.kind) !== event.delegate) {
      ran.set(event.kind, event.delegate);
      samples.clear();
    }
    samples?.push(started, event.latency);
    cost += performance.now() - started;
  });
  const offFrame = telemetry.on("frame", () => {
    const started = performance.now();
    frames.push(started, 0);
    if (started - lastRefresh >= REFRESH_MS) {
      lastRefresh = started;
      refresh(started);
    }
    const spent = performance.now() - started;
    cost += spent;
    costMax = Math.max(costMax, spent);
    frameCount++;
  });
  const store: LabStore = {
    latencySamples: (kind, now) =>
      latency.get(kind)?.since(now - WINDOW_MS) ?? {
        times: new Float64Array(0),
        values: new Float64Array(0),
      },
    history: (series, now) =>
      (series === "processed" ? processed : render).since(now - HISTORY_MS),
    close() {
      offInference();
      offFrame();
    },
  };
  return store;
}
