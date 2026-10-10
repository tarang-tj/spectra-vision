/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Stage presses while the Walls tool is chosen. A press grabs one of the
// tool's own points, or places the next floor corner or ceiling point, and
// the same press can keep dragging it. A press on one of the Ruler's own
// handles is left to the Ruler, so the reference stays adjustable.
import type { StagePointerEvent } from "../../../stage/stage-hooks";
import type { ExtensionEnv } from "../extension-types";
import type { Pt } from "../homography";
import { TAP_SIGMA_SCREEN_PX } from "../monte-carlo";
import { hit } from "../store";
import {
  addCorner,
  closeRoom,
  getWalls,
  movePoint,
  pickCorner,
  setTop,
} from "./store";

type Grab = {
  id: number;
  kind: "base" | "top";
  i: number;
  /** Canvas position of the press, and whether it has become a drag. */
  from: { x: number; y: number };
  moved: boolean;
};
let grab: Grab | null = null;
/** The panel closed or the picture moved: forget a drag in progress. */
export const dropGrab = () => {
  grab = null;
};

const HIT_MOUSE = 12,
  HIT_TOUCH = 24,
  /** A press that moves less than this (canvas px) is a tap, not a drag. */
  SLOP = 4;

function nearest(at: Pt, radius: number): Pick<Grab, "kind" | "i"> | null {
  let best: Pick<Grab, "kind" | "i"> | null = null,
    bestD = radius;
  getWalls().corners.forEach((c, i) => {
    for (const kind of ["top", "base"] as const) {
      const p = c[kind];
      if (!p) continue;
      const d = Math.hypot(p.x - at.x, p.y - at.y);
      if (d <= bestD) {
        bestD = d;
        best = { kind, i };
      }
    }
  });
  return best;
}

export function wallsPointer(e: StagePointerEvent, env: ExtensionEnv): boolean {
  const sigma = TAP_SIGMA_SCREEN_PX / e.scale,
    at: Pt = {
      x: e.point.x * e.source.width,
      y: e.point.y * e.source.height,
      s: sigma,
    };
  if (e.type === "down") {
    // A second finger does not replace the point the first one holds.
    if (grab && grab.id !== e.pointerId) return true;
    // The same pointer pressing again: its last release never arrived.
    grab = null;
    if (!e.inside || !env.d.sheet) return false;
    const radius =
        (e.pointerType === "mouse" ? HIT_MOUSE : HIT_TOUCH) / e.scale,
      own = nearest(at, radius),
      start = { id: e.pointerId, from: e.canvas };
    if (own) {
      grab = { ...start, ...own, moved: false };
      return true;
    }
    if (hit(at, radius)) return false;
    const walls = getWalls();
    if (!walls.closed) {
      grab = { ...start, kind: "base", i: addCorner(at), moved: true };
      return true;
    }
    if (walls.pick === null) return false;
    const i = walls.pick;
    setTop(i, at);
    grab = { ...start, kind: "top", i, moved: true };
    return true;
  }
  if (!grab || grab.id !== e.pointerId) return false;
  if (
    !grab.moved &&
    Math.hypot(e.canvas.x - grab.from.x, e.canvas.y - grab.from.y) > SLOP
  )
    grab.moved = true;
  if (e.type === "move") {
    if (grab.moved) movePoint(grab.kind, grab.i, at);
    return true;
  }
  const { kind, i, moved } = grab;
  grab = null;
  if (e.cancelled) return true;
  if (moved) movePoint(kind, i, at);
  else if (kind === "base") {
    // A tap on a corner: the first one closes the room, any one of a closed
    // room asks for its ceiling point.
    const walls = getWalls();
    if (walls.closed) pickCorner(i);
    else if (i === 0) closeRoom();
  }
  return true;
}
