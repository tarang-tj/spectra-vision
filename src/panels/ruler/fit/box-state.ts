/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The one box the user stands on the floor. Kept at module level like the
// Ruler's own state, and replaced, never mutated. Sizes are in mm, the
// position is in the reference plane's mm and the rotation is in degrees.
import { useSyncExternalStore } from "react";
import { onPointsCleared } from "../state";

export type BoxState = {
  /** Width, depth and height in mm, as typed. */
  w: number;
  d: number;
  h: number;
  /** Centre of the footprint on the plane, mm; null until it is placed. */
  at: { x: number; y: number } | null;
  /** Turn about the centre, degrees, counter-clockwise in plane coordinates. */
  rot: number;
};

/** Sizes offered as buttons. They are examples, not standards. */
export const EXAMPLES: readonly {
  name: string;
  w: number;
  d: number;
  h: number;
}[] = [
  { name: "sofa", w: 2000, d: 900, h: 850 },
  { name: "desk", w: 1400, d: 700, h: 750 },
  { name: "fridge", w: 700, d: 700, h: 1800 },
];

export const MAX_SIDE_MM = 100_000;
const HISTORY = 50;

const initial = (): BoxState => ({ ...sizeOf(EXAMPLES[0]), at: null, rot: 0 });
const sizeOf = (e: { w: number; d: number; h: number }) => ({
  w: e.w,
  d: e.d,
  h: e.h,
});

let state = initial();
/** Earlier states for Undo, each with the name of the edit that left it. */
let history: { state: BoxState; tag: string }[] = [];
const listeners = new Set<() => void>();

export const getBox = () => state;
export const subscribeBox = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useBox = () => useSyncExternalStore(subscribeBox, getBox);

const emit = (next: BoxState) => {
  state = next;
  listeners.forEach((l) => l());
};

/** Change the box. `tag` names the edit: a run of edits with the same tag (a
 * drag, typing in one field) is one step for Undo. */
export function setBox(patch: Partial<BoxState>, tag: string) {
  const last = history[history.length - 1];
  if (!last || last.tag !== tag) {
    history.push({ state, tag });
    if (history.length > HISTORY) history.shift();
  }
  emit({ ...state, ...patch });
}

/** End a run of edits, so the next one with the same tag is a new step. */
export function sealEdit() {
  const last = history[history.length - 1];
  if (last) history[history.length - 1] = { ...last, tag: "" };
}

/** Step back one edit; nothing happens when there is none. */
export function undoBox() {
  const last = history.pop();
  if (last) emit(last.state);
}

/** Put the box back as it was when this run of edits began (a cancelled drag). */
export function cancelEdit(tag: string) {
  const last = history[history.length - 1];
  if (last && last.tag === tag) undoBox();
}

/** Turn in degrees, kept within (-180, 180]. */
export const wrapDegrees = (deg: number): number => {
  const r = ((deg % 360) + 360) % 360;
  return r > 180 ? r - 360 : r;
};

export const setSize = (side: "w" | "d" | "h", mm: number) => {
  if (Number.isFinite(mm) && mm > 0 && mm <= MAX_SIDE_MM)
    setBox({ [side]: mm }, `size:${side}`);
};
export const setExample = (i: number) => {
  setBox(sizeOf(EXAMPLES[i]), "example");
  sealEdit();
};
export const setRotation = (deg: number, tag = "rot") => {
  if (Number.isFinite(deg)) setBox({ rot: wrapDegrees(deg) }, tag);
};
export const turnBy = (deg: number) => {
  setRotation(state.rot + deg);
  sealEdit();
};
/** Slide the placed box along its own width (`along`) and depth (`across`). */
export function nudge(along: number, across: number) {
  if (!state.at) return;
  const a = (state.rot * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  setBox(
    {
      at: {
        x: state.at.x + along * c - across * s,
        y: state.at.y + along * s + across * c,
      },
    },
    "nudge",
  );
  sealEdit();
}
export const removeBox = () => {
  if (!state.at) return;
  setBox({ at: null }, "remove");
  sealEdit();
};

/** Back to a clean slate (tests). */
export const resetBox = () => {
  history = [];
  emit(initial());
};

// The box stands on one picture. When the Ruler drops its points (Clear, a
// new picture, a video that moved on) the placement goes too. The typed
// sizes are not points on the picture, so they stay.
onPointsCleared(() => {
  history = [];
  if (state.at || state.rot) emit({ ...state, at: null, rot: 0 });
});
