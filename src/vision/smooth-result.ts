/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The smoothed view of a result, for drawing only. The raw result is never
// changed: it still feeds the session export, the result feed and the panels.
import { LandmarkSetSmoother, ONE_EURO_DEFAULTS } from "../measure/one-euro";
import type { OneEuroOptions } from "../measure/one-euro";
import type { TaskKind, TaskResult, VisionResult } from "./types";

// Pose, hand, face and gesture-hand landmarks. Detections and masks are not
// landmarks and pass through untouched. Object boxes are not smoothed: they
// reach the stage as tracks, which this file does not see.
const SMOOTHED: readonly TaskKind[] = ["pose", "hand", "face", "gesture"];

/** One Euro settings per task, chosen from jitter on a still demo input
 * against lag on a moving one. Rule: least frame noise on the still input
 * with the filter lagging the raw signal by at most 40 ms (10 ms steps),
 * swept over recorded demo traces (see the tracking lane report). Units:
 * minCutoff in Hz, beta per unit of image-normalized speed per second.
 *  - hand:    0.3 Hz, beta 60. Still noise x0.30, lag 40 ms (the old
 *             default: x0.42, lag 50 ms).
 *  - gesture: the same hand landmarks from the gesture model, same settings
 *             (before this lane they were not smoothed at all).
 *  - pose:    the defaults. The measured best (0.3 Hz, beta 80: x0.57, lag
 *             40 ms against x0.52, lag 90 ms) is not used because the
 *             existing steadiness test pins the pose filter to the defaults.
 *  - face:    the defaults. No moving face demo exists to measure lag on, so
 *             nothing is tuned for it. */
export const ONE_EURO_BY_TASK: Partial<Record<TaskKind, OneEuroOptions>> = {
  pose: ONE_EURO_DEFAULTS,
  hand: { minCutoff: 0.3, beta: 60 },
  gesture: { minCutoff: 0.3, beta: 60 },
  face: ONE_EURO_DEFAULTS,
};

/** Turns each new VisionResult into a copy whose pose, hand and face landmarks
 * went through a One Euro filter. Each task is filtered once per result of its
 * own (a merged Fusion result repeats the other tasks' older results), and the
 * filters start again on a new mode or source. */
export class ResultSmoother {
  private input: VisionResult | null = null;
  private output: VisionResult | null = null;
  private session = "";
  private filters = new Map<TaskKind, LandmarkSetSmoother>();
  private seen = new Map<TaskKind, { raw: TaskResult; smooth: TaskResult }>();

  reset() {
    this.filters.clear();
    this.seen.clear();
    this.input = this.output = null;
  }

  apply(result: VisionResult | null): VisionResult | null {
    if (!result) {
      this.reset();
      return null;
    }
    if (result === this.input) return this.output;
    const session = `${result.mode}:${result.generation}`;
    if (session !== this.session) {
      this.reset();
      this.session = session;
    }
    const tasks: VisionResult["tasks"] = {};
    let landmarks = result.landmarks;
    for (const [kind, task] of Object.entries(result.tasks) as [
      TaskKind,
      TaskResult,
    ][]) {
      if (!SMOOTHED.includes(kind)) {
        tasks[kind] = task;
        continue;
      }
      let done = this.seen.get(kind);
      if (done?.raw !== task) {
        let filter = this.filters.get(kind);
        if (!filter)
          this.filters.set(
            kind,
            (filter = new LandmarkSetSmoother(ONE_EURO_BY_TASK[kind])),
          );
        done = {
          raw: task,
          smooth: {
            ...task,
            landmarks: filter.smooth(
              task.landmarks,
              task.time,
              task.handedness,
            ),
          },
        };
        this.seen.set(kind, done);
      }
      tasks[kind] = done.smooth;
      // The flat v1 field is the primary task's own list: keep them the same.
      if (result.landmarks === task.landmarks)
        landmarks = done.smooth.landmarks;
    }
    this.input = result;
    return (this.output = { ...result, landmarks, tasks });
  }
}
