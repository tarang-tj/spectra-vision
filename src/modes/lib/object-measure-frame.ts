/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The readings of the frame on stage (object-measured.ts), worked out once
// per result and kept for whoever shows them: the box labels, the Inspect
// rows, the settings' status line, the Library and the session export.
import { detectorSide } from "../../measure/box-size";
import type { Source, Track, VisionResult } from "../../vision/types";
import { settledRetakes } from "./depth-measured";
import { depthScale } from "./depth-metric";
import { depthExtra } from "./depth-readout";
import { measureTracks, type Measurement } from "./object-measured";

/** What was last measured, for the settings, the Library and the export. */
export type Latest = {
  generation: number;
  measurement: Measurement;
  map: { width: number; height: number; delegate: "CPU" | "GPU"; ms: number };
};
let memo: { key: unknown[]; value: Measurement } | null = null,
  latest: Latest | null = null;
const listeners = new Set<() => void>();
// After the caller returns: a reading may be asked for inside a draw or a
// render, and neither may set state.
const changed = (next: Latest | null) => {
  latest = next;
  queueMicrotask(() => listeners.forEach((listener) => listener()));
};
export const latestMeasured = () => latest;
export function onMeasured(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Measuring stopped, or Objects left the stage. */
export function forgetMeasured() {
  memo = null;
  if (latest) changed(null);
}

/** The readings for a result that carries a depth map, or null without one.
 * Worked out once per tracks list, map, scale and set of retakes, so it is
 * cheap to ask for on every drawn frame. */
export function measureFrame(
  result: VisionResult | null,
  tracks: readonly Track[],
  source: Source | null,
): Measurement | null {
  const task = result?.tasks.depth,
    extra = depthExtra(task);
  if (!result || !task || !extra) {
    forgetMeasured();
    return null;
  }
  const scale = depthScale(extra, task.generation, source),
    retakes = scale.metric ? settledRetakes(scale) : null,
    side = detectorSide(result.tasks.object?.model),
    key = [tracks, extra.values, scale, retakes, side];
  if (memo && memo.key.every((part, i) => part === key[i])) return memo.value;
  const value = measureTracks(tracks, extra, scale, retakes, side);
  memo = { key, value };
  changed({
    generation: task.generation,
    measurement: value,
    map: {
      width: extra.width,
      height: extra.height,
      delegate: task.delegate,
      ms: task.latency,
    },
  });
  return value;
}
