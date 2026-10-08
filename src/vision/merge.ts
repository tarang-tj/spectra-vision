import type { Mode, TaskKind, TaskResult, VisionResult } from "./types";

/** Fold one task's new result into the latest results of a mode's other tasks.
 *
 * - Results from an older source generation are dropped, never mixed in.
 * - The flat v1 fields (time, detections, landmarks, handedness) come from the
 *   primary task, the first in `kinds`, so single-task modes are unchanged.
 * - Workers run in parallel, so the frame's latency is the slowest task's. */
export function mergeResults(
  mode: Mode,
  kinds: TaskKind[],
  latest: Partial<Record<TaskKind, TaskResult>>,
  incoming: TaskResult,
): VisionResult {
  const tasks: Partial<Record<TaskKind, TaskResult>> = {};
  let latency = 0;
  for (const kind of kinds) {
    const entry = kind === incoming.kind ? incoming : latest[kind];
    if (!entry || entry.generation !== incoming.generation) continue;
    tasks[kind] = entry;
    latency = Math.max(latency, entry.latency);
  }
  const primary = tasks[kinds[0]] ?? incoming;
  return {
    mode,
    generation: incoming.generation,
    time: primary.time,
    latency,
    detections: primary.detections,
    landmarks: primary.landmarks,
    handedness: primary.handedness,
    tasks,
  };
}
