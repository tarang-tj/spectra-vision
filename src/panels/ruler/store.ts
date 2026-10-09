/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Ruler's own state, kept at module level so it survives the panel being
// unmounted while another tab is open. Points are in source pixels. The state
// object is replaced, never mutated, so useSyncExternalStore can compare it.
import { useSyncExternalStore } from "react";
import type { Pt } from "./homography";
import { isUnit, type Unit } from "./units";

export type Measure = { a: Pt; b: Pt | null };
export type Handle =
  | { kind: "corner"; i: number }
  | { kind: "end"; m: number; end: "a" | "b" };
export type RulerState = {
  refId: string;
  customA: string;
  customB: string;
  /** Reference corners in tap order (at most four). */
  corners: Pt[];
  swap: boolean;
  measures: Measure[];
  unit: Unit;
  /** The source these points belong to, and its size in pixels. */
  generation: number | null;
  source: { w: number; h: number } | null;
  /** Canvas CSS pixels per source pixel, as last drawn. */
  scale: number;
};

const UNIT_KEY = "spectra.ruler.unit.v1";
function savedUnit(): Unit {
  try {
    const v = localStorage.getItem(UNIT_KEY);
    if (isUnit(v)) return v;
  } catch {
    /* Storage blocked: the default unit is fine. */
  }
  return "cm";
}

const initial = (): RulerState => ({
  refId: "letter",
  customA: "",
  customB: "",
  corners: [],
  swap: false,
  measures: [],
  unit: savedUnit(),
  generation: null,
  source: null,
  scale: 1,
});

let state = initial();
const listeners = new Set<() => void>();
const set = (patch: Partial<RulerState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

export const getState = () => state;
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useRuler = () => useSyncExternalStore(subscribe, getState);
/** Back to a clean slate (tests). */
export const resetRuler = () => set({ ...initial(), unit: state.unit });

export const setRef = (refId: string) => set({ refId, swap: false });
export const setCustom = (customA: string, customB: string) =>
  set({ customA, customB });
export const setUnit = (unit: Unit) => {
  try {
    localStorage.setItem(UNIT_KEY, unit);
  } catch {
    /* Remembering the unit is a courtesy; carry on without it. */
  }
  set({ unit });
};
export const toggleSwap = () => set({ swap: !state.swap });

/** Called with each frame the overlay draws. Points belong to one source: a
 * new source (another photo, a camera restart) clears them, because they
 * would sit on the wrong picture. */
export function bindSource(
  generation: number,
  w: number,
  h: number,
  scale: number,
) {
  if (state.generation !== generation) {
    set({
      generation,
      source: { w, h },
      scale,
      corners: [],
      measures: [],
      swap: false,
    });
  } else if (
    Math.abs(scale - state.scale) / state.scale > 0.005 ||
    !state.source
  ) {
    set({ source: { w, h }, scale });
  }
}

const clamp = (p: Pt): Pt => {
  const s = state.source;
  return s
    ? {
        x: Math.min(s.w, Math.max(0, p.x)),
        y: Math.min(s.h, Math.max(0, p.y)),
      }
    : p;
};

/** Add the next point: a reference corner until there are four, then the
 * start or end of a measurement. Returns the handle so a drag can continue. */
export function place(p: Pt): Handle {
  const at = clamp(p);
  if (state.corners.length < 4) {
    set({ corners: [...state.corners, at] });
    return { kind: "corner", i: state.corners.length - 1 };
  }
  const last = state.measures[state.measures.length - 1];
  if (last && last.b === null) {
    const measures = state.measures.slice();
    measures[measures.length - 1] = { a: last.a, b: at };
    set({ measures });
    return { kind: "end", m: measures.length - 1, end: "b" };
  }
  set({ measures: [...state.measures, { a: at, b: null }] });
  return { kind: "end", m: state.measures.length - 1, end: "a" };
}

export function move(handle: Handle, p: Pt) {
  const at = clamp(p);
  if (handle.kind === "corner") {
    if (!state.corners[handle.i]) return;
    const corners = state.corners.slice();
    corners[handle.i] = at;
    set({ corners });
    return;
  }
  const m = state.measures[handle.m];
  if (!m) return;
  const measures = state.measures.slice();
  measures[handle.m] = { ...m, [handle.end]: at };
  set({ measures });
}

/** Distance in canvas CSS pixels is the caller's business; this finds the
 * nearest handle within `radiusSrc` source pixels. */
export function hit(p: Pt, radiusSrc: number): Handle | null {
  let best: Handle | null = null,
    bestD = radiusSrc;
  const test = (q: Pt | null, h: Handle) => {
    if (!q) return;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  };
  state.corners.forEach((c, i) => test(c, { kind: "corner", i }));
  state.measures.forEach((m, i) => {
    test(m.a, { kind: "end", m: i, end: "a" });
    test(m.b, { kind: "end", m: i, end: "b" });
  });
  return best;
}

/** Remove the most recently placed point. */
export function undo() {
  const last = state.measures[state.measures.length - 1];
  if (last) {
    set({
      measures:
        last.b === null
          ? state.measures.slice(0, -1)
          : [...state.measures.slice(0, -1), { a: last.a, b: null }],
    });
  } else if (state.corners.length) {
    set({ corners: state.corners.slice(0, -1) });
  }
}

export const clear = () => set({ corners: [], measures: [], swap: false });
