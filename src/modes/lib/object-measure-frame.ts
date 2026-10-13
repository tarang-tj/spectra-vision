/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The readings of the frame on stage (object-measured.ts), worked out once
// per result and kept for whoever shows them: the box labels, the Inspect
// rows, the settings' status line, the Library and the session export.
import { detectorSide } from "../../measure/box-size";
import type { Source, Track, VisionResult } from "../../vision/types";
import { retakesOf, settledRetakes } from "./depth-measured";
import { depthScale } from "./depth-metric";
import { depthExtra } from "./depth-readout";
import { measureOn } from "./object-measure";
import {
  measureTracks,
  type BoxReading,
  type Measurement,
} from "./object-measured";

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
 * cheap to ask for on every drawn frame. `ask` is for the stage alone, once
 * a drawn frame: it counts toward working the retakes out, so the bars
 * arrive shortly after the Ruler's points stop changing (depth-measured.ts). */
export function measureFrame(
  result: VisionResult | null,
  tracks: readonly Track[],
  source: Source | null,
  ask = false,
): Measurement | null {
  const task = result?.tasks.depth,
    extra = depthExtra(task);
  if (!result || !task || !extra) {
    forgetMeasured();
    return null;
  }
  const scale = depthScale(extra, task.generation, source),
    retakes = !scale.metric
      ? null
      : ask
        ? retakesOf(scale)
        : settledRetakes(scale),
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

const byId = new WeakMap<Measurement, Map<number, BoxReading>>();
/** Each track's reading by id, for the box labels and the Inspect rows.
 * Finds nothing while Measure objects is off or there are no metres. */
export function readingsOf(
  frame: {
    result: VisionResult | null;
    tracks: Track[];
    source: Source | null;
  },
  ask = false,
): (id: number) => BoxReading | undefined {
  const measurement = measureOn()
    ? measureFrame(frame.result, frame.tracks, frame.source, ask)
    : null;
  if (!measureOn()) forgetMeasured();
  if (!measurement?.metric) return () => undefined;
  let map = byId.get(measurement);
  if (!map)
    byId.set(
      measurement,
      (map = new Map(measurement.boxes.map((box) => [box.id, box]))),
    );
  return (id) => map.get(id);
}
