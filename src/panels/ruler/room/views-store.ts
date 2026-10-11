/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The pictures of one room. A view is one still picture, held in memory and
// never uploaded, with everything the Ruler, Box and Walls hold for it. The
// view on the stage is saved whenever one of those stores changes, so leaving
// it loses nothing; entering a view puts its picture on the stage and its
// state back. Module level, like the Ruler's own state, and replaced, never
// mutated.
import { useSyncExternalStore } from "react";
import {
  getBox,
  restoreBox,
  snapshotBox,
  subscribeBox,
  type BoxState,
} from "../fit/box-state";
import {
  getState,
  restore,
  snapshot,
  subscribe,
  type RulerSnapshot,
  type Tool,
} from "../state";
import {
  restoreKnown,
  snapshotKnown,
  type KnownSnapshot,
} from "../store-known";
import { dropView } from "./store";
import {
  restoreWalls,
  snapshotWalls,
  subscribeWalls,
  type WallsState,
} from "../walls/store";

export type ViewSnap = {
  ruler: RulerSnapshot;
  known: KnownSnapshot;
  box: BoxState;
  walls: WallsState;
};
export type View = {
  /** Stable for the life of the room and kept in the room file. */
  id: number;
  label: string;
  /** The picture's bytes; null when it came from a file saved without them. */
  blob: Blob | null;
  /** A small copy for the strip, as a data URL. */
  thumb: string | null;
  snap: ViewSnap;
  /** The source generation it is, or was last, shown as. */
  generation: number | null;
};
export type Views = {
  views: readonly View[];
  /** Id of the view on the stage, or null when the stage shows something
   * that is not one of the room's pictures. */
  current: number | null;
  busy: boolean;
  problem: string | null;
};
/** Puts a picture on the stage and gives its generation (Studio.loadPicture). */
export type Load = (blob: Blob, label: string) => Promise<number>;

const empty: Views = { views: [], current: null, busy: false, problem: null };
let state = empty,
  nextId = 1,
  restoring = false;
const listeners = new Set<() => void>();
const emit = (next: Views) => {
  state = next;
  listeners.forEach((l) => l());
};
export const getViews = () => state;
export const subscribeViews = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useViews = () => useSyncExternalStore(subscribeViews, getViews);
export const viewOf = (id: number | null) =>
  state.views.find((v) => v.id === id) ?? null;
/** "Picture 2": views are named by their place in the strip. */
export const viewName = (id: number, views = state.views) =>
  `Picture ${views.findIndex((v) => v.id === id) + 1}`;

const NO_WALLS: WallsState = { corners: [], closed: false, pick: null };
/** Everything the three stores hold for the picture on the stage. */
export const takeSnap = (): ViewSnap => ({
  ruler: snapshot(),
  known: snapshotKnown(),
  box: snapshotBox(),
  walls: snapshotWalls(),
});
/** A new picture of the same room: the reference choice, the lens switch and
 * the typed box sizes carry over; nothing tapped does. */
export const blankSnap = (): ViewSnap => ({
  ruler: {
    ...snapshot(),
    corners: [],
    measures: [],
    shapes: [],
    swap: false,
    source: null,
  },
  known: { extraRefs: [], tapeSd: getState().tapeSd },
  box: { ...getBox(), at: null, rot: 0 },
  walls: NO_WALLS,
});
const sameSnap = (a: ViewSnap, b: ViewSnap) =>
  a.box === b.box &&
  a.walls === b.walls &&
  a.known.extraRefs === b.known.extraRefs &&
  a.known.tapeSd === b.known.tapeSd &&
  (Object.keys(b.ruler) as (keyof RulerSnapshot)[]).every(
    (k) => a.ruler[k] === b.ruler[k],
  );
const patch = (id: number, change: Partial<View>, more?: Partial<Views>) =>
  emit({
    ...state,
    ...more,
    views: state.views.map((v) => (v.id === id ? { ...v, ...change } : v)),
  });

/** Save the stage's view, or let go of it when the stage moved on to a
 * picture that is not the room's (an upload, a demo, a camera). */
function capture() {
  const view = viewOf(state.current),
    generation = getState().generation;
  if (!view || restoring || state.busy) return;
  if (generation !== view.generation) {
    if (generation !== null) emit({ ...state, current: null });
    return;
  }
  const snap = takeSnap();
  if (!sameSnap(view.snap, snap)) patch(view.id, { snap });
}
subscribe(capture);
subscribeBox(capture);
subscribeWalls(capture);

/** Put a view's state back into the three stores, bound to `generation`. */
function enter(snap: ViewSnap, generation: number, tool: Tool) {
  restoring = true;
  try {
    restore(snap.ruler, generation, tool);
    restoreKnown(snap.known);
    restoreBox(snap.box);
    restoreWalls(snap.walls);
  } finally {
    restoring = false;
  }
}

/** Make the picture already on the stage (bound to the Ruler as
 * `generation`) a view, with what is tapped on it. */
export function adoptView(blob: Blob, label: string, generation: number) {
  const id = nextId++;
  emit({
    ...state,
    problem: null,
    current: id,
    views: [
      ...state.views,
      { id, label, blob, thumb: null, snap: takeSnap(), generation },
    ],
  });
  return id;
}

/** Show a view: its picture goes on the stage and its state comes back. */
export async function showView(id: number, load: Load): Promise<boolean> {
  const view = viewOf(id);
  if (!view || !view.blob || state.busy) return false;
  capture();
  // Read now: the new picture's first frame puts the tool back to Span.
  const tool = getState().tool;
  emit({ ...state, busy: true, problem: null });
  let generation: number;
  try {
    generation = await load(view.blob, view.label);
  } catch {
    emit({
      ...state,
      busy: false,
      current: null,
      problem: `${viewName(id)} could not be opened. Its picture may be damaged.`,
    });
    return false;
  }
  // The view as it is now: its thumbnail may have arrived while it loaded.
  const now = viewOf(id);
  if (!now) {
    emit({ ...state, busy: false, current: null });
    return false;
  }
  patch(id, { generation }, { current: id });
  enter(now.snap, generation, tool);
  emit({ ...state, busy: false });
  capture();
  return true;
}

/** Add a picture and show it. `snap` is what is already tapped on it (a
 * frozen frame kept as a picture); a fresh picture starts blank. */
export async function addView(
  blob: Blob,
  label: string,
  load: Load,
  snap: ViewSnap = blankSnap(),
): Promise<number | null> {
  if (state.busy) return null;
  capture();
  const id = nextId++;
  emit({
    ...state,
    views: [
      ...state.views,
      { id, label, blob, thumb: null, snap, generation: null },
    ],
  });
  if (await showView(id, load)) return id;
  // A picture that cannot be opened is not kept.
  emit({ ...state, views: state.views.filter((v) => v.id !== id) });
  return null;
}

/** Take a view out of the room. When it was on the stage the nearest other
 * picture is shown; with none left the stage keeps what it shows. */
export async function removeView(id: number, load: Load) {
  if (state.busy || !viewOf(id)) return;
  const at = state.views.findIndex((v) => v.id === id),
    views = state.views.filter((v) => v.id !== id),
    wasCurrent = state.current === id,
    next = views[Math.min(at, views.length - 1)];
  emit({ ...state, views, current: wasCurrent ? null : state.current });
  dropView(id);
  if (wasCurrent && next?.blob) await showView(next.id, load);
}

export const setThumb = (id: number, thumb: string) => {
  if (viewOf(id)) patch(id, { thumb });
};

/** Replace the whole room (a room file was opened). */
export function loadViews(views: readonly View[]) {
  nextId = views.reduce((m, v) => Math.max(m, v.id), 0) + 1;
  emit({ ...empty, views });
}
/** Back to no room (tests, and "Close room"). */
export const resetViews = () => {
  nextId = 1;
  emit(empty);
};
