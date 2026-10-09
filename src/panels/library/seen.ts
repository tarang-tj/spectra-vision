/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { finerInfo, finerOn, onFinerChange } from "../../modes/lib/finer";
import { onVisionResult } from "../../vision/result-feed";
import type { VisionResult } from "../../vision/types";

// What Objects has named this page session, counted from the result feed
// (vision/result-feed.ts) from the moment the page loads, whether or not the
// Library tab is open. A count is the number of results (frames) a name was
// in, not the number of distinct objects: the models do not say whether two
// frames show the same chair. Nothing is stored or sent anywhere.
export type Seen = { count: number; last: number };
type Classifier = {
  state: "loading" | "ready" | "failed";
  note: string;
  floor: number;
  /** The source the figures below were measured on. */
  generation: number;
  /** In the latest result: boxes found, and boxes with a finer name. */
  boxes: number;
  named: number;
};

const detector = new Map<string, Seen>(),
  finer = new Map<string, Seen>(),
  listeners = new Set<() => void>();
let classifier: Classifier | null = null,
  version = 0,
  notified = 0,
  dirty = false;

const bump = (map: Map<string, Seen>, label: string, now: number) => {
  const old = map.get(label);
  map.set(label, { count: (old?.count ?? 0) + 1, last: now });
};
function notify(now: number, force = false) {
  dirty = true;
  // At most four redraws a second, without a timer: a result that arrives
  // inside the gap leaves the change pending for the next one.
  if (!force && now - notified < 250) return;
  notified = now;
  dirty = false;
  version++;
  for (const listener of [...listeners]) listener();
}

/** Count one merged result. Only Objects results are counted. */
export function record(result: VisionResult, now = Date.now()) {
  if (result.mode !== "objects") return;
  const task = result.tasks.object;
  if (!task) return;
  const labels = new Set<string>(),
    names = new Set<string>();
  for (const d of task.detections) {
    labels.add(d.label);
    if (d.finer) names.add(d.finer.label);
  }
  labels.forEach((label) => bump(detector, label, now));
  names.forEach((label) => bump(finer, label, now));
  const info = finerInfo(task.extra),
    next: Classifier | null = info
      ? {
          state: info.state,
          note: info.note ?? "",
          floor: info.floor,
          generation: result.generation,
          boxes: task.detections.length,
          named: task.detections.filter((d) => d.finer).length,
        }
      : null;
  const changed = next?.state !== classifier?.state;
  classifier = next;
  notify(now, changed);
}
export function resetSeen() {
  detector.clear();
  finer.clear();
  classifier = null;
  notify(Date.now(), true);
}

export const seenDetector = (label: string): Seen | undefined =>
  detector.get(label);
export const seenFiner = (label: string): Seen | undefined => finer.get(label);
/** The classifier's state in the latest Objects result, or null while Finer names is off. */
export const classifierState = (): Classifier | null => classifier;
export const seenVersion = () => version;
export const hasPending = () => dirty;
export function onSeenChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Figures about the classifier describe the setting being on: turning it off
// takes them away at once, not at the next result.
onFinerChange(() => {
  if (!finerOn() && classifier) {
    classifier = null;
    notify(Date.now(), true);
  }
});
// Started when this module loads, so counting does not wait for the tab.
onVisionResult((result) => record(result));
