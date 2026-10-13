/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The two-level score gate of Objects. A box is first shown when a detection
// reaches the Confidence slider's value. After that the object's track goes
// on taking detections down to STAY_BELOW under it, so an object whose score
// wavers round the slider's value keeps one box and one id instead of
// blinking and being numbered again. The worker (public/vision-worker.js)
// returns that lower band apart, as `extra.faint`: `detections` holds only
// what reached the slider's value, which is what the Library counts and the
// session export read. Only the tracker reads the band.
import type { Tracker } from "./tracker";
import type { Detection, TaskResult, Track, VisionResult } from "./types";

/** How far under the Confidence value a track still takes a detection. The
 * worker keeps the same figure as KEEP_BELOW; tests/modes-worker.test.ts
 * holds the two together. */
export const STAY_BELOW = 0.15;

const NONE: Detection[] = [];

/** The detections of an object result that scored inside the band under the
 * gate. Empty for any other task and when the band held nothing. */
export function faintOf(task: Pick<TaskResult, "extra"> | undefined) {
  const faint = task?.extra?.faint;
  return Array.isArray(faint) ? (faint as Detection[]) : NONE;
}

/** One result into the tracker: what reached the Confidence value as
 * detections, the band under it beside them. The stage and the Lab meter both go through here. */
export const trackResult = (
  tracker: Pick<Tracker, "update">,
  result: Pick<VisionResult, "detections" | "time" | "tasks">,
): Track[] =>
  tracker.update(result.detections, result.time, faintOf(result.tasks.object));
