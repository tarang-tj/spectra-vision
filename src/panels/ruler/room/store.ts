/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The room's own points: floor points marked in one picture or in several,
// and the outline built from some of them, in order round the room. Taps are
// in the source pixels of the picture they were made in. Module level and
// replaced, never mutated, like the Ruler's other stores.
import { useSyncExternalStore } from "react";
import type { Pt } from "../homography";
import type { RoomPoint } from "./room-solve";

/** What the next tap on the picture does: a new outline corner, a new floor
 * mark (a point that is not a corner, for tying pictures together), or the
 * same floor point as an existing room point, seen in this picture. */
export type Next =
  | { kind: "corner" }
  | { kind: "mark" }
  | { kind: "link"; point: number };
export type RoomState = {
  points: readonly RoomPoint[];
  /** Ids of the outline's corners, in order round the room. */
  outline: readonly number[];
  closed: boolean;
  next: Next;
  nextId: number;
  /** What the step line must say about the last press or Undo, until the
   * room next changes: a tap that took hold of a point and moved nothing, or
   * an Undo that was not done because the change was made on another
   * picture. */
  note: { held: number } | { undoOn: number } | null;
};

const empty: RoomState = {
  points: [],
  outline: [],
  closed: false,
  next: { kind: "corner" },
  nextId: 1,
  note: null,
};
const HISTORY = 200;
/** Earlier states for Undo, each with the picture its change was tapped on
 * (null for a change made in the panel, which is on screen whatever the
 * picture). */
let state = empty,
  history: { state: RoomState; view: number | null }[] = [];
const listeners = new Set<() => void>();

export const getRoom = () => state;
export const subscribeRoom = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useRoom = () => useSyncExternalStore(subscribeRoom, getRoom);
function commit(next: RoomState, remember = true, view: number | null = null) {
  if (remember) history = [...history.slice(-HISTORY + 1), { state, view }];
  // Any change to the room ends the note about the press before it.
  state = next.note ? { ...next, note: null } : next;
  listeners.forEach((l) => l());
}
export function setNote(note: RoomState["note"]) {
  if (note === state.note) return;
  state = { ...state, note };
  listeners.forEach((l) => l());
}
/** The kind of new point last chosen with the buttons. It stays chosen tap
 * after tap, so marking two floor marks does not add an unwanted corner. */
let chosen: "corner" | "mark" = "corner";
/** What a tap does after a point is made or marked: the kind last chosen,
 * and floor marks only once the outline is closed. */
const resting = (closed: boolean): Next => ({
  kind: closed ? "mark" : chosen,
});

/** A tap at `at` in picture `view`. Returns the point it made or marked. */
export function tapRoom(view: number, at: Pt): number {
  const { next } = state;
  if (next.kind === "link") {
    const point = state.points.find((p) => p.id === next.point);
    if (point) {
      commit(
        {
          ...state,
          points: state.points.map((p) =>
            p === point
              ? {
                  ...p,
                  obs: [...p.obs.filter((o) => o.view !== view), { view, at }],
                }
              : p,
          ),
          next: resting(state.closed),
        },
        true,
        view,
      );
      return point.id;
    }
  }
  return addPoint(view, at, next.kind === "corner" && !state.closed, view);
}
/** A new room point seen in `view`, as an outline corner or a floor mark.
 * `tapped` is the picture it was tapped on, or null when it was taken from
 * the list in the panel. */
export function addPoint(
  view: number,
  at: Pt,
  corner: boolean,
  tapped: number | null = null,
): number {
  const id = state.nextId,
    asCorner = corner && !state.closed;
  commit(
    {
      ...state,
      points: [...state.points, { id, obs: [{ view, at }] }],
      outline: asCorner ? [...state.outline, id] : state.outline,
      next: resting(state.closed),
      nextId: id + 1,
    },
    true,
    tapped,
  );
  return id;
}
/** Drag a mark. Not a step for Undo. */
export function moveObs(point: number, view: number, at: Pt) {
  commit(
    {
      ...state,
      points: state.points.map((p) =>
        p.id === point
          ? {
              ...p,
              obs: p.obs.map((o) => (o.view === view ? { view, at } : o)),
            }
          : p,
      ),
    },
    false,
  );
}
export function setNext(next: Next) {
  if (next.kind === "corner" && state.closed) return;
  if (next.kind !== "link") chosen = next.kind;
  commit({ ...state, next }, false);
}
export function removePoint(id: number) {
  if (!state.points.some((p) => p.id === id)) return;
  const outline = state.outline.filter((o) => o !== id),
    closed = state.closed && outline.length >= 3;
  commit({
    ...state,
    points: state.points.filter((p) => p.id !== id),
    outline,
    closed,
    next:
      state.next.kind === "link" && state.next.point === id
        ? resting(closed)
        : state.next,
  });
}
/** Take one picture's mark of a point away; the point goes with its last. */
export function unmark(id: number, view: number) {
  const point = state.points.find((p) => p.id === id);
  if (!point?.obs.some((o) => o.view === view)) return;
  if (point.obs.length === 1) return removePoint(id);
  commit({
    ...state,
    points: state.points.map((p) =>
      p.id === id ? { ...p, obs: p.obs.filter((o) => o.view !== view) } : p,
    ),
  });
}
/** Put a point at the end of the outline, or take it out. */
export function setCorner(id: number, on: boolean) {
  const has = state.outline.includes(id);
  if (on === has || !state.points.some((p) => p.id === id)) return;
  const outline = on
    ? [...state.outline, id]
    : state.outline.filter((o) => o !== id);
  commit({ ...state, outline, closed: state.closed && outline.length >= 3 });
}
export function closeOutline(closed: boolean) {
  if (closed === state.closed || (closed && state.outline.length < 3)) return;
  commit({ ...state, closed, next: resting(closed) });
}
/** Take back the last change. A change tapped on a picture is undone only
 * while that picture is on the stage (`onStage` is its id): otherwise Undo
 * would remove a mark that is not on screen, so it says where to look. */
export function undoRoom(onStage: number | null) {
  const back = history[history.length - 1];
  if (!back) return;
  if (back.view !== null && back.view !== onStage)
    return setNote({ undoOn: back.view });
  history = history.slice(0, -1);
  commit(back.state, false);
}
/** A picture left the room: its marks go, and points left with none. */
export function dropView(view: number) {
  if (!state.points.some((p) => p.obs.some((o) => o.view === view))) return;
  const points = state.points
      .map((p) => ({ ...p, obs: p.obs.filter((o) => o.view !== view) }))
      .filter((p) => p.obs.length),
    outline = state.outline.filter((id) => points.some((p) => p.id === id)),
    closed = state.closed && outline.length >= 3;
  history = [];
  commit(
    {
      ...state,
      points,
      outline,
      closed,
      next: state.next.kind === "link" ? resting(closed) : state.next,
    },
    false,
  );
}
/** Replace the whole room (a room file was opened), or empty it. */
export function loadRoom(
  room: Pick<RoomState, "points" | "outline" | "closed"> | null,
) {
  history = [];
  chosen = "corner";
  commit(
    room
      ? {
          ...room,
          note: null,
          next: resting(room.closed),
          nextId: room.points.reduce((m, p) => Math.max(m, p.id), 0) + 1,
        }
      : empty,
    false,
  );
}
