/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The two-level score gate of Objects. A box is first shown when a detection
// reaches the Confidence slider's value. After that the object's track goes
// on taking detections down to STAY_BELOW under it, so an object whose score
// wavers round the slider's value keeps one box and one id instead of
// blinking and being numbered again. The worker (public/vision-worker.js)
// returns that lower band apart, as `extra.faint`: `detections` holds only
// what reached the slider's value, which is what the Library counts and the
// session export read. Only the tracker reads the band.
import type { Detection, TaskResult } from "./types";

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
