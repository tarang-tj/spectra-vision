/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { SampleWindow } from "../../telemetry/stats";
import { onVisionResult } from "../../vision/result-feed";
import { ResultSmoother } from "../../vision/smooth-result";
import { STEADY_TRACKER, Tracker } from "../../vision/tracker";
import type { TaskKind, VisionResult } from "../../vision/types";
import {
  IdentityLog,
  JitterWindow,
  NO_JITTER,
  type Identity,
  type Jitter,
} from "./stability-core";

/** The tasks whose landmarks the meter measures. */
const LANDMARK_KINDS: readonly TaskKind[] = ["pose", "hand", "face", "gesture"];
/** Figures refresh at most this often, and only when a result arrives. */
const REFRESH_MS = 250;
const HISTORY = 240;

export type KindFigures = { kind: TaskKind; raw: Jitter; smooth: Jitter };
export type StabilitySnapshot = {
  /** Time of the newest result the figures end at. */
  now: number;
  kinds: KindFigures[];
  /** Box-centre spread of tracked objects; null for a mode that tracks none. */
  boxes: Jitter | null;
  identity: Identity | null;
};
export type StabilityStore = {
  /** Raw and smoothed spread of the first measured landmark task, per refresh. */
  history(now: number): {
    raw: { times: Float64Array; values: Float64Array };
    smooth: { times: Float64Array; values: Float64Array };
  };
  close(): void;
};
export type SourceSize = { width: number; height: number } | null;

/** Measures, on the results the running mode really produces, how much each
 * landmark and each tracked box scatters over the last few seconds, raw and
 * after the One Euro filter the stage would draw, and how often a tracked
 * object changes identity. It listens to the result feed (silent while paused
 * or hidden) and owns no timer and no animation loop. */
export function openStabilityStore(
  options: {
    tracked: boolean;
    /** The source's pixel size now; positions are measured in source pixels. */
    size(): SourceSize;
  },
  onRefresh: (snapshot: StabilitySnapshot) => void,
): StabilityStore {
  const raw = new Map<TaskKind, JitterWindow>(),
    smooth = new Map<TaskKind, JitterWindow>(),
    done = new Map<TaskKind, unknown>(),
    boxes = new JitterWindow(),
    identity = new IdentityLog(),
    smoother = new ResultSmoother(),
    tracker = new Tracker(STEADY_TRACKER),
    rawHistory = new SampleWindow(HISTORY),
    smoothHistory = new SampleWindow(HISTORY);
  let session = "",
    lastRefresh = -Infinity,
    lastTime = -Infinity;

  const clear = () => {
    for (const w of [...raw.values(), ...smooth.values(), boxes]) w.reset();
    done.clear();
    identity.reset();
    tracker.reset();
    smoother.reset();
    rawHistory.clear();
    smoothHistory.clear();
    lastTime = -Infinity;
  };
  const trace = (map: Map<TaskKind, JitterWindow>, kind: TaskKind) => {
    let w = map.get(kind);
    if (!w) map.set(kind, (w = new JitterWindow()));
    return w;
  };
  // Points are keyed by a number, so a result allocates no strings: the task,
  // the slot in the result, the hand's side and the landmark index. A hand
  // that the models relabel or swap starts a fresh trace instead of mixing
  // two hands into one.
  const sides = new Map<string, number>();
  const feed = (
    target: JitterWindow,
    kind: TaskKind,
    task: NonNullable<VisionResult["tasks"][TaskKind]>,
    size: { width: number; height: number },
  ) =>
    task.landmarks.forEach((points, set) => {
      const label = task.handedness[set] ?? "";
      let side = sides.get(label);
      if (side === undefined) sides.set(label, (side = sides.size % 8));
      const base =
        ((LANDMARK_KINDS.indexOf(kind) * 8 + (set % 8)) * 8 + side) * 1024;
      points.forEach((p, index) =>
        target.add(
          base + index,
          task.time,
          p.x * size.width,
          p.y * size.height,
        ),
      );
    });

  const unlisten = onVisionResult((result, generation) => {
    const key = `${result.mode}:${generation}`;
    if (key !== session) {
      session = key;
      clear();
    }
    const size = options.size();
    if (!size || !(size.width > 0) || !(size.height > 0)) return;
    const smoothed = smoother.apply(result);
    for (const kind of LANDMARK_KINDS) {
      const task = result.tasks[kind];
      if (!task || done.get(kind) === task) continue;
      done.set(kind, task);
      feed(trace(raw, kind), kind, task, size);
      const other = smoothed?.tasks[kind];
      if (other) feed(trace(smooth, kind), kind, other, size);
    }
    if (options.tracked && result.time > lastTime) {
      lastTime = result.time;
      const tracks = tracker.update(result.detections, result.time);
      identity.update(tracks, result.time);
      for (const t of tracks)
        boxes.add(
          `box:${t.id}`,
          result.time,
          (t.box.x + t.box.w / 2) * size.width,
          (t.box.y + t.box.h / 2) * size.height,
        );
    }
    if (result.time - lastRefresh < REFRESH_MS) return;
    lastRefresh = result.time;
    const kinds = LANDMARK_KINDS.filter((kind) => raw.has(kind)).map(
      (kind): KindFigures => ({
        kind,
        raw: raw.get(kind)!.measure(result.time),
        smooth: smooth.get(kind)?.measure(result.time) ?? NO_JITTER,
      }),
    );
    if (kinds.length) {
      if (Number.isFinite(kinds[0].raw.value))
        rawHistory.push(result.time, kinds[0].raw.value);
      if (Number.isFinite(kinds[0].smooth.value))
        smoothHistory.push(result.time, kinds[0].smooth.value);
    }
    onRefresh({
      now: result.time,
      kinds,
      boxes: options.tracked ? boxes.measure(result.time) : null,
      identity: options.tracked ? identity.measure(result.time) : null,
    });
  });
  return {
    history: (now) => ({
      raw: rawHistory.since(now - 30_000),
      smooth: smoothHistory.since(now - 30_000),
    }),
    close: unlisten,
  };
}
