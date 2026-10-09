/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Ruler's own state, kept at module level so it survives the panel being
// unmounted while another tab is open. Points are in source pixels. The state
// object is replaced, never mutated, so useSyncExternalStore can compare it.
import { useSyncExternalStore } from "react";
import type { Pt } from "./homography";
import { isUnit, type Unit } from "./units";

export type Measure = { a: Pt; b: Pt | null };
/** What a tap adds: a two-point span, a path, a closed outline, or a point on
 * an edge that is straight in reality (for the lens correction). */
export type Tool = "span" | "path" | "area" | "edge";
export type ShapeKind = "path" | "area" | "edge";
export type Shape = { kind: ShapeKind; pts: Pt[]; done: boolean };
/** Fewest points that make a finished shape of each kind. */
export const MIN_POINTS: Record<ShapeKind, number> = {
  path: 3,
  area: 3,
  edge: 4,
};
export type Handle =
  | { kind: "corner"; i: number }
  | { kind: "end"; m: number; end: "a" | "b" }
  | { kind: "vertex"; s: number; i: number };
export type RulerState = {
  refId: string;
  customA: string;
  customB: string;
  /** Reference corners in tap order (at most four). */
  corners: Pt[];
  swap: boolean;
  measures: Measure[];
  tool: Tool;
  shapes: Shape[];
  /** Whether the user asked for the lens correction (it applies only if the
   * fit from the tapped edges improves straightness). */
  lensOn: boolean;
  unit: Unit;
  /** The source these points belong to, and its size in pixels. */
  generation: number | null;
  source: { w: number; h: number } | null;
  /** Canvas CSS pixels per source pixel, as last drawn. */
  scale: number;
  /** While a handle is dragged: the long edge (tap indices) to hold fixed. */
  lock: [number, number] | null;
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
  tool: "span",
  shapes: [],
  lensOn: false,
  unit: savedUnit(),
  generation: null,
  source: null,
  scale: 1,
  lock: null,
});

let state = initial();
const listeners = new Set<() => void>();
export const set = (patch: Partial<RulerState>) => {
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
export const setLensOn = (lensOn: boolean) => set({ lensOn });
export const setLock = (lock: [number, number] | null) => set({ lock });

/** True when nothing has been placed. */
export const isEmpty = (s: RulerState) =>
  !s.corners.length && !s.measures.length && !s.shapes.length;

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
      shapes: [],
      swap: false,
    });
  } else if (
    Math.abs(scale - state.scale) / state.scale > 0.005 ||
    !state.source
  ) {
    set({ source: { w, h }, scale });
  }
}

/** Points belong to one frozen frame. When a video or camera source goes from
 * still to moving they describe a picture that is gone, so they and every
 * result built on them are dropped. A still image keeps its points. */
export function bindStillness(isVideo: boolean, still: boolean) {
  if (isVideo && !still && !isEmpty(state)) {
    set({
      corners: [],
      measures: [],
      shapes: [],
      swap: false,
      lock: null,
    });
  }
}
