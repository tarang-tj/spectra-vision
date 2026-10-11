/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Everything the Ruler, its known sizes, Box and Walls hold for one picture,
// taken from the stores and put back through their own snapshot functions.
import {
  getBox,
  restoreBox,
  snapshotBox,
  type BoxState,
} from "../fit/box-state";
import {
  getState,
  restore,
  snapshot,
  type RulerSnapshot,
  type Tool,
} from "../state";
import {
  restoreKnown,
  snapshotKnown,
  type KnownSnapshot,
} from "../store-known";
import { restoreWalls, snapshotWalls, type WallsState } from "../walls/store";

export type ViewSnap = {
  ruler: RulerSnapshot;
  known: KnownSnapshot;
  box: BoxState;
  walls: WallsState;
};
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
export const sameSnap = (a: ViewSnap, b: ViewSnap) =>
  a.box === b.box &&
  a.walls === b.walls &&
  a.known.extraRefs === b.known.extraRefs &&
  a.known.tapeSd === b.known.tapeSd &&
  (Object.keys(b.ruler) as (keyof RulerSnapshot)[]).every(
    (k) => a.ruler[k] === b.ruler[k],
  );

/** Put a view's state back into the stores, bound to `generation`. `tool` is
 * the tool in use before the picture changed. */
export function enterSnap(snap: ViewSnap, generation: number, tool: Tool) {
  restore(snap.ruler, generation, tool);
  restoreKnown(snap.known);
  restoreBox(snap.box);
  restoreWalls(snap.walls);
}
