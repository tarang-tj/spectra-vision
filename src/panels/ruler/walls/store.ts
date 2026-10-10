/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the Walls tool has placed on the frozen picture: floor corners in tap
// order and, per corner, the point where its wall edge meets the ceiling.
// Points are taps in source pixels, each with the tap uncertainty it was
// placed with. The state object is replaced, never mutated.
import { useSyncExternalStore } from "react";
import type { Pt } from "../homography";
import { setPlumbs, type PlumbLine } from "../plumbs";
import { getState, onPointsCleared } from "../state";

export type Corner = { base: Pt; top: Pt | null };
export type WallsState = {
  corners: readonly Corner[];
  closed: boolean;
  /** The corner whose ceiling point the next tap sets, or null. */
  pick: number | null;
};

const empty: WallsState = { corners: [], closed: false, pick: null };
const HISTORY = 200;
let state = empty,
  history: WallsState[] = [],
  published: readonly PlumbLine[] = [];
const listeners = new Set<() => void>();

export const getWalls = () => state;
export const subscribeWalls = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useWalls = () => useSyncExternalStore(subscribeWalls, getWalls);

/** Every base and ceiling pair is an edge that is plumb in reality, so it is
 * handed to the camera fit. Published only when a pair changed. */
function publish() {
  const lines = state.corners.flatMap((c) =>
    c.top ? [{ a: c.base, b: c.top }] : [],
  );
  if (
    lines.length === published.length &&
    lines.every((l, i) => l.a === published[i].a && l.b === published[i].b)
  )
    return;
  published = lines;
  setPlumbs("walls", lines);
}

function commit(next: WallsState, remember: boolean) {
  if (remember) history = [...history.slice(-HISTORY + 1), state];
  state = next;
  publish();
  listeners.forEach((l) => l());
}

const clamp = (p: Pt): Pt => {
  const s = getState().source;
  return s
    ? {
        ...p,
        x: Math.min(s.w, Math.max(0, p.x)),
        y: Math.min(s.h, Math.max(0, p.y)),
      }
    : p;
};
const firstWithoutTop = (corners: readonly Corner[], from = 0) => {
  for (let k = 0; k < corners.length; k++) {
    const i = (from + k) % corners.length;
    if (!corners[i].top) return i;
  }
  return null;
};

/** Add the next floor corner; returns its index, or -1 once closed. */
export function addCorner(p: Pt): number {
  if (state.closed) return -1;
  commit(
    { ...state, corners: [...state.corners, { base: clamp(p), top: null }] },
    true,
  );
  return state.corners.length - 1;
}

/** Close the outline (three corners or more) and ask for the first ceiling
 * point. */
export function closeRoom() {
  if (state.closed || state.corners.length < 3) return;
  commit({ ...state, closed: true, pick: 0 }, true);
}

/** Take a finished outline (taps in order) as the closed floor. */
export function copyOutline(pts: readonly Pt[]) {
  if (pts.length < 3) return;
  commit(
    {
      corners: pts.map((p) => ({ base: clamp(p), top: null })),
      closed: true,
      pick: 0,
    },
    true,
  );
}

/** Choose which corner the next tap gives a ceiling point to. */
export function pickCorner(i: number | null) {
  if (i !== null && (!state.closed || !state.corners[i])) return;
  if (state.pick !== i) commit({ ...state, pick: i }, false);
}

/** Set corner `i`'s ceiling point and move on to the next corner without one. */
export function setTop(i: number, p: Pt) {
  if (!state.closed || !state.corners[i]) return;
  const corners = state.corners.slice();
  corners[i] = { ...corners[i], top: clamp(p) };
  commit({ ...state, corners, pick: firstWithoutTop(corners, i) }, true);
}

/** Drag a placed point. Not a step for Undo. */
export function movePoint(kind: "base" | "top", i: number, p: Pt) {
  const corner = state.corners[i];
  if (!corner || (kind === "top" && !corner.top)) return;
  const corners = state.corners.slice();
  corners[i] = { ...corner, [kind]: clamp(p) };
  commit({ ...state, corners }, false);
}

/** Take back the last tap, close or copied outline. */
export function undoWalls() {
  const back = history[history.length - 1];
  if (!back) return;
  history = history.slice(0, -1);
  commit(back, false);
}

function reset() {
  history = [];
  if (state !== empty) commit(empty, false);
  published = [];
}
// Clear, a new picture or a video that moved on: these points are gone too.
onPointsCleared(reset);
