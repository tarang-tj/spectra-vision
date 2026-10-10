/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Edges the user has marked as plumb in reality (a wall corner, a door frame).
// Any Ruler tool may contribute some under its own name; the camera fit reads
// them all, because each one steadies the focal length and so every height.
import type { Pt } from "./homography";
import { onPointsCleared } from "./state";

/** Two taps (source pixels) on one plumb edge. */
export type PlumbLine = { a: Pt; b: Pt };

const byOwner = new Map<string, readonly PlumbLine[]>();
const listeners = new Set<() => void>();
let version = 0;
let all: readonly PlumbLine[] = [];

function changed() {
  version++;
  all = [...byOwner.values()].flat();
  listeners.forEach((l) => l());
}

/** Replace the plumb edges contributed under `owner` (a tool's name). */
export function setPlumbs(owner: string, lines: readonly PlumbLine[]) {
  if (!lines.length && !byOwner.has(owner)) return;
  if (lines.length) byOwner.set(owner, lines);
  else byOwner.delete(owner);
  changed();
}
/** Every plumb edge, from every tool. A new array only when one changed. */
export const allPlumbs = (): readonly PlumbLine[] => all;
/** Goes up by one on every change: a cheap memo key. */
export const plumbVersion = () => version;
export const subscribePlumbs = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

onPointsCleared(() => {
  if (!byOwner.size) return;
  byOwner.clear();
  changed();
});
