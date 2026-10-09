/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The smoothed view of a result, for drawing only. The raw result is never
// changed: it still feeds the session export, the result feed and the panels.
import { LandmarkSetSmoother } from "../measure/one-euro";
import type { TaskKind, TaskResult, VisionResult } from "./types";

// Pose, hand and face landmarks. Detections, masks and gestures are not
// landmarks and pass through untouched.
const SMOOTHED: readonly TaskKind[] = ["pose", "hand", "face"];

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
          this.filters.set(kind, (filter = new LandmarkSetSmoother()));
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
