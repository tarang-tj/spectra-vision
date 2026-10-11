/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Builds what a person would have tapped in each picture of the synthetic
// room (tests/fixtures/room-scene.ts), as the snapshots the room code reads.
// The truth stays in the fixture; this file only plays the person.
import { derive } from "../../src/panels/ruler/derive";
import { applyHomography, type Pt } from "../../src/panels/ruler/homography";
import type { RoomInput } from "../../src/panels/ruler/room/room-solve";
import { frameOf, stateOf } from "../../src/panels/ruler/room/view-frame";
import type { ViewSnap } from "../../src/panels/ruler/room/views-store";
import {
  BOARD,
  boardCorners,
  cameraFor,
  inBoardFrame,
  type Board,
  type P,
} from "../fixtures/room-scene";

export const W = 1600,
  H = 1200;
export type Nudge = (p: P) => P;
export const exact: Nudge = (p) => p;
export type Shot = {
  /** Which camera took it. */
  cam: number;
  board?: Board;
  /** The board lay this far (mm) from its place when this picture was taken. */
  shift?: P;
  nudge?: Nudge;
  /** Tap uncertainty stored with each point, source pixels. */
  sigma?: number;
};

/** A tap on floor point `p` in camera `cam`'s picture. */
export const tapOn = (
  cam: number,
  p: P,
  nudge: Nudge = exact,
  sigma = 1.5,
): Pt => {
  const q = nudge(cameraFor(cam, W, H).shoot(p.x, p.y));
  return { x: q.x, y: q.y, s: sigma };
};

/** One picture with its reference tapped. A person looks at the lengths the
 * Ruler writes on the sheet's edges and presses Swap sides when they are the
 * wrong way round; so does this. */
export function snapOf(shot: Shot): ViewSnap {
  const board = shot.board ?? BOARD,
    dx = shot.shift?.x ?? 0,
    dy = shot.shift?.y ?? 0,
    physical = boardCorners(board).map((c) => ({ x: c.x + dx, y: c.y + dy })),
    taps = physical.map((c) => tapOn(shot.cam, c, shot.nudge, shot.sigma)),
    make = (swap: boolean): ViewSnap => ({
      ruler: {
        refId: "custom",
        customA: String(board.w),
        customB: String(board.h),
        corners: taps,
        swap,
        measures: [],
        shapes: [],
        lensOn: false,
        source: { w: W, h: H },
        scale: 1,
      },
      known: { extraRefs: [], tapeSd: "2" },
      box: { w: 2000, d: 900, h: 850, at: null, rot: 0 },
      walls: { corners: [], closed: false, pick: null },
    }),
    plain = make(false),
    sheet = derive(stateOf(plain)).sheet;
  if (!sheet) return plain;
  // Which physical corners the Ruler's first edge joins.
  const nearest = (p: Pt) =>
      taps.reduce(
        (best, t, i) =>
          Math.hypot(t.x - p.x, t.y - p.y) <
          Math.hypot(taps[best].x - p.x, taps[best].y - p.y)
            ? i
            : best,
        0,
      ),
    a = physical[nearest(sheet.ordered[0])],
    b = physical[nearest(sheet.ordered[1])],
    firstIsLong =
      Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - Math.max(board.w, board.h)) <
      1;
  return sheet.firstIsLong === firstIsLong ? plain : make(true);
}

export type Mark = { id: number; seen: { view: number; at: Pt }[] };
/** The solver's input for these pictures (view ids 1, 2, ... in order). */
export function roomOf(
  snaps: (ViewSnap | null)[],
  points: Mark[],
  outline: number[] = [],
  closed = false,
): RoomInput {
  return {
    views: snaps.map((snap, i) => ({
      id: i + 1,
      name: `Picture ${i + 1}`,
      frame: snap ? frameOf(i + 1, snap) : null,
    })),
    points: points.map((p) => ({ id: p.id, obs: p.seen })),
    outline,
    closed,
  };
}

/** Which board corner the first picture's frame starts at: the one whose
 * hand-written frame (the fixture's `inBoardFrame`) agrees with where that
 * picture's own map puts the board's corners. `cam` took the first picture. */
export function baseCorner(
  room: RoomInput,
  cam: number,
  board: Board = BOARD,
): number {
  const f = room.views[0].frame!,
    miss = [0, 1, 2, 3].map((k) =>
      Math.max(
        ...boardCorners(board).map((c) => {
          const want = inBoardFrame(c, k, board),
            got = applyHomography(f.h, tapOn(cam, c))!;
          return Math.hypot(want.x - got.x, want.y - got.y);
        }),
      ),
    ),
    k = miss.indexOf(Math.min(...miss));
  // Noisy taps move the board's corners by millimetres, never by a side.
  if (miss[k] > 100) throw new Error("the frame starts at no board corner");
  return k;
}
