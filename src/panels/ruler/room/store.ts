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
};

const empty: RoomState = {
  points: [],
  outline: [],
  closed: false,
  next: { kind: "corner" },
  nextId: 1,
};
const HISTORY = 200;
let state = empty,
  history: RoomState[] = [];
const listeners = new Set<() => void>();

export const getRoom = () => state;
export const subscribeRoom = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const useRoom = () => useSyncExternalStore(subscribeRoom, getRoom);
function commit(next: RoomState, remember = true) {
  if (remember) history = [...history.slice(-HISTORY + 1), state];
  state = next;
  listeners.forEach((l) => l());
}
/** What a tap does once a link is made or cannot be: corners while the
 * outline is open, floor marks once it is closed. */
const resting = (closed: boolean): Next => ({
  kind: closed ? "mark" : "corner",
});

/** A tap at `at` in picture `view`. Returns the point it made or marked. */
export function tapRoom(view: number, at: Pt): number {
  const { next } = state;
  if (next.kind === "link") {
    const point = state.points.find((p) => p.id === next.point);
    if (point) {
      commit({
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
      });
      return point.id;
    }
  }
  return addPoint(view, at, next.kind === "corner" && !state.closed);
}
/** A new room point seen in `view`, as an outline corner or a floor mark. */
export function addPoint(view: number, at: Pt, corner: boolean): number {
  const id = state.nextId,
    asCorner = corner && !state.closed;
  commit({
    ...state,
    points: [...state.points, { id, obs: [{ view, at }] }],
    outline: asCorner ? [...state.outline, id] : state.outline,
    next: resting(state.closed),
    nextId: id + 1,
  });
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
export function undoRoom() {
  const back = history[history.length - 1];
  if (!back) return;
  history = history.slice(0, -1);
  commit(back, false);
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
  commit(
    room
      ? {
          ...room,
          next: resting(room.closed),
          nextId: room.points.reduce((m, p) => Math.max(m, p.id), 0) + 1,
        }
      : empty,
    false,
  );
}
