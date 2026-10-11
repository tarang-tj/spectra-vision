/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The room as it stands now: the solver's answer for the pictures and points
// held in the two stores. Worked out once per change, not per drawn frame.
import { solveRoom, type RoomInput, type RoomSolution } from "./room-solve";
import { getRoom, type RoomState } from "./store";
import { frameOf } from "./view-frame";
import { getViews, type View, type ViewSnap } from "./views-store";

export type Current = { input: RoomInput; solution: RoomSolution };

const swaps = new WeakMap<ViewSnap, ViewSnap>();
/** The same picture with its reference's long and short sides swapped. Kept
 * per snapshot, so asking again does not solve the picture again. */
function swappedSnap(snap: ViewSnap): ViewSnap {
  let hit = swaps.get(snap);
  if (!hit)
    swaps.set(
      snap,
      (hit = { ...snap, ruler: { ...snap.ruler, swap: !snap.ruler.swap } }),
    );
  return hit;
}
let memo: {
  views: readonly View[];
  room: RoomState;
  value: Current;
} | null = null;

export function currentRoom(
  views: readonly View[] = getViews().views,
  room: RoomState = getRoom(),
): Current {
  if (
    memo &&
    memo.views === views &&
    memo.room.points === room.points &&
    memo.room.outline === room.outline &&
    memo.room.closed === room.closed
  )
    return memo.value;
  const input: RoomInput = {
      views: views.map((v, i) => ({
        id: v.id,
        name: `Picture ${i + 1}`,
        frame: frameOf(v.id, v.snap),
        swapped: () => frameOf(v.id, swappedSnap(v.snap), undefined, "swapped"),
      })),
      points: room.points,
      outline: room.outline,
      closed: room.closed,
    },
    value = { input, solution: solveRoom(input) };
  memo = { views, room, value };
  return value;
}

/** The view the stage shows and the Ruler is bound to, or null when the
 * stage's picture is not one of the room's. */
export function stageView(generation: number | null): View | null {
  const { views, current } = getViews(),
    view = views.find((v) => v.id === current) ?? null;
  return view && generation !== null && view.generation === generation
    ? view
    : null;
}
