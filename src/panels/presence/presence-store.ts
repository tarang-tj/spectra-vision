/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { testHooksEnabled } from "../../test-hooks";
import { onVisionResult } from "../../vision/result-feed";
import type { VisionResult } from "../../vision/types";
import { Calibrator } from "./calibration";
import type { Baseline } from "./calibration";
import { LiveSeries } from "./live-series";
import { computeRows } from "./metrics";
import type { MetricRow } from "./row";
import { SignalExtractor } from "./signals";
import {
  CALIBRATION_MS,
  DEFAULT_THRESHOLDS,
  MAX_STEP_MS,
  THRESHOLD_LIMITS,
  emptyRecording,
} from "./types";
import type { FaceSample, Recording, Signals, Thresholds } from "./types";

export type Phase = "idle" | "calibrating" | "measuring" | "done";
export type EndReason = "user" | "source" | "mode" | "limit";
export type ModelUse = { task: string; model: string; delegate: string };
export type PresenceState = {
  phase: Phase;
  endReason: EndReason | null;
  startedAt: string | null;
  /** Calibration length used, and how much of it has run. */
  calibrationMs: number;
  calibratedMs: number;
  baseline: Baseline | null;
  thresholds: Thresholds;
  rows: MetricRow[];
  coveredMs: number;
  pauses: number;
  models: ModelUse[];
};

const NOTIFY_MS = 250,
  ROWS_MS = 1000,
  /** A session this long ends by itself, so the recording cannot grow without bound. */
  MAX_SAMPLES = 40_000;
const MODE = "fusion";

// The e2e suite shortens the calibration through this hook, read only on a page
// opened with `?spectra-test`. A shortened run says so in its exports.
type TestFlag = { calibrationMs?: number };
const calibrationLength = () => {
  const flag = testHooksEnabled()
    ? (globalThis as { __spectraPresenceTest?: TestFlag }).__spectraPresenceTest
    : undefined;
  return flag?.calibrationMs && flag.calibrationMs > 0
    ? flag.calibrationMs
    : CALIBRATION_MS;
};

let phase: Phase = "idle",
  endReason: EndReason | null = null,
  startedAt: string | null = null,
  calMs = CALIBRATION_MS,
  calStart: number | null = null,
  calibrated = 0,
  aspect = 1,
  generation: number | null = null,
  lastTime: number | null = null,
  baseline: Baseline | null = null,
  thresholds: Thresholds = { ...DEFAULT_THRESHOLDS },
  rows: MetricRow[] = [],
  rec: Recording = emptyRecording(),
  models: ModelUse[] = [],
  lastNotify = -Infinity,
  lastRows = -Infinity,
  calibrator = new Calibrator(),
  latestFace: FaceSample | null = null;
const extractor = new SignalExtractor(),
  live = new LiveSeries(),
  listeners = new Set<() => void>();

const active = () => phase === "calibrating" || phase === "measuring";
const build = (): PresenceState => ({
  phase,
  endReason,
  startedAt,
  calibrationMs: calMs,
  calibratedMs: calibrated,
  baseline,
  thresholds,
  rows,
  coveredMs: rec.coveredMs,
  pauses: rec.pauses,
  models,
});
let snapshot = build();
function notify() {
  snapshot = build();
  listeners.forEach((fn) => fn());
}
const recompute = () => {
  rows = baseline ? computeRows(rec, baseline, thresholds) : [];
};

function finish(reason: EndReason) {
  if (phase === "measuring") {
    recompute();
    phase = "done";
  } else if (phase === "calibrating") phase = "idle";
  endReason = reason;
  notify();
}

function record(sig: Signals, step: number) {
  rec.results++;
  rec.coveredMs += step;
  if (step > 0) rec.steps++;
  if (sig.face !== undefined) {
    rec.fresh.face++;
    if (sig.face) {
      rec.seen.face++;
      rec.face.push(sig.face);
    }
  }
  if (sig.pose !== undefined) {
    rec.fresh.pose++;
    if (sig.pose) {
      rec.seen.pose++;
      rec.pose.push(sig.pose);
    }
  }
  if (sig.hand) {
    rec.fresh.hand++;
    rec.hand.push(sig.hand);
    if (sig.hand.hands.length) rec.seen.hand++;
  }
}

/** One merged result from the feed. Exported so unit tests can drive it. */
export function ingest(result: VisionResult, gen: number) {
  if (!active()) return;
  if (result.mode !== MODE) return finish("mode");
  if (generation === null) generation = gen;
  else if (gen !== generation) return finish("source");
  const gap =
    lastTime !== null &&
    (result.time < lastTime || result.time - lastTime > MAX_STEP_MS);
  if (gap) {
    // The stage stopped (paused or hidden): no speed is taken across it.
    extractor.reset();
    if (phase === "measuring") rec.pauses++;
    else calStart = null;
  }
  const step = lastTime !== null && !gap ? result.time - lastTime : 0;
  lastTime = result.time;
  const sig = extractor.ingest(result, aspect);
  if (sig.face) latestFace = sig.face;
  models = (["face", "pose", "hand"] as const).flatMap((task) => {
    const t = result.tasks[task];
    return t
      ? [{ task, model: t.model ?? "unknown", delegate: t.delegate }]
      : [];
  });
  if (phase === "calibrating") {
    if (calStart === null) {
      calStart = result.time;
      calibrator = new Calibrator();
    }
    calibrator.add(sig);
    calibrated = Math.min(calMs, result.time - calStart);
    if (calibrated >= calMs) {
      baseline = calibrator.finish(calibrated);
      phase = "measuring";
      lastNotify = lastRows = -Infinity;
    }
  } else {
    record(sig, step);
    live.push(sig, baseline!);
    if (
      rec.face.length >= MAX_SAMPLES ||
      rec.pose.length >= MAX_SAMPLES ||
      rec.hand.length >= MAX_SAMPLES
    )
      return finish("limit");
    if (result.time - lastRows >= ROWS_MS) {
      lastRows = result.time;
      recompute();
    }
  }
  if (result.time - lastNotify >= NOTIFY_MS || result.time < lastNotify) {
    lastNotify = result.time;
    notify();
  }
}

// Module level, so measuring goes on while another tab is open. It does no work
// at all unless a session is running.
onVisionResult(ingest);

export const presenceStore = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
  getState: () => snapshot,
  /** Begin calibrating. `sourceAspect` is source width / height. False when it is unusable. */
  start(sourceAspect: number): boolean {
    if (active() || !Number.isFinite(sourceAspect) || sourceAspect <= 0)
      return false;
    aspect = sourceAspect;
    calMs = calibrationLength();
    phase = "calibrating";
    endReason = null;
    startedAt = new Date().toISOString();
    calStart = generation = lastTime = null;
    calibrated = 0;
    baseline = null;
    rows = [];
    rec = emptyRecording();
    latestFace = null;
    calibrator = new Calibrator();
    extractor.reset();
    live.clear();
    lastNotify = lastRows = -Infinity;
    notify();
    return true;
  },
  stop() {
    if (active()) finish("user");
  },
  /** Forget the finished session. */
  clear() {
    if (active()) return;
    phase = "idle";
    endReason = null;
    startedAt = null;
    baseline = null;
    rows = [];
    rec = emptyRecording();
    latestFace = null;
    live.clear();
    notify();
  },
  setThresholds(patch: Partial<Thresholds>) {
    const next = { ...thresholds };
    for (const key of Object.keys(patch) as (keyof Thresholds)[]) {
      const value = patch[key],
        { min, max } = THRESHOLD_LIMITS[key];
      if (typeof value === "number" && Number.isFinite(value))
        next[key] = Math.min(max, Math.max(min, value));
    }
    thresholds = next;
    if (phase === "measuring" || phase === "done") recompute();
    notify();
  },
  /** Strip-chart data and the latest result time they end at. */
  charts: () => ({ series: live.series, now: lastTime ?? 0 }),
  /** For the stage overlay: the newest face sample, while a session runs. */
  overlay: () => (active() ? { face: latestFace, baseline, aspect } : null),
  /** Counts for the export, not the raw samples. */
  recording: () => ({
    ...rec,
    face: rec.face.length,
    pose: rec.pose.length,
    hand: rec.hand.length,
  }),
  shortened: () => calMs !== CALIBRATION_MS,
};
