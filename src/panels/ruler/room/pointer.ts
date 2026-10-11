/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Stage presses while the Room tool is chosen. A press grabs one of the
// room's own marks in this picture, or makes the next one, and the same
// press can go on dragging it. A press on one of the Ruler's own handles is
// left to the Ruler, so the reference stays adjustable.
import type { StagePointerEvent } from "../../../stage/stage-hooks";
import type { ExtensionEnv } from "../extension-types";
import type { Pt } from "../homography";
import { TAP_SIGMA_SCREEN_PX } from "../monte-carlo";
import { getState, handles, hit, onPointsCleared } from "../store";
import { grabRadius, hitFloor, hitRadius, tapPixel, TAP_TRAVEL } from "../tap";
import { stageView } from "./current";
import { closeOutline, getRoom, moveObs, setNote, tapRoom } from "./store";

type Grab = {
  id: number;
  point: number;
  view: number;
  from: { x: number; y: number };
  moved: boolean;
};
let grab: Grab | null = null;
/** The panel closed or the picture changed: forget a drag in progress. */
export const dropGrab = () => {
  grab = null;
};
onPointsCleared(dropGrab);

/** The room mark in this picture that a press at `at` takes hold of, by the
 * Ruler's own rule: within `radius`, less where another mark or one of the
 * Ruler's handles is close (`grabRadius`), never under `floor`. So the
 * space between two close marks stays free for a tap that places a point. */
function nearest(
  view: number,
  at: Pt,
  radius: number,
  floor: number,
): number | null {
  const marks = getRoom().points.flatMap((p) => {
      const o = p.obs.find((x) => x.view === view);
      return o ? [{ id: p.id, at: o.at }] : [];
    }),
    others = [
      ...marks.map((m) => m.at),
      ...handles(getState()).map((h) => h.at),
    ];
  let best: number | null = null,
    bestD = Infinity;
  for (const m of marks) {
    const d = Math.hypot(m.at.x - at.x, m.at.y - at.y);
    if (d > radius || d > bestD) continue;
    let spacing = Infinity;
    for (const o of others)
      if (o !== m.at)
        spacing = Math.min(spacing, Math.hypot(o.x - m.at.x, o.y - m.at.y));
    if (d > grabRadius(radius, floor, spacing)) continue;
    bestD = d;
    best = m.id;
  }
  return best;
}

export function roomPointer(e: StagePointerEvent, env: ExtensionEnv): boolean {
  const at: Pt = { ...tapPixel(e), s: TAP_SIGMA_SCREEN_PX / e.scale },
    view = stageView(env.s.generation);
  if (e.type === "down") {
    // A second finger does not replace the point the first one holds.
    if (grab && grab.id !== e.pointerId) return true;
    grab = null;
    if (!e.inside || !env.d.sheet || !view) return false;
    const radius = hitRadius(e),
      floor = hitFloor(e),
      start = { id: e.pointerId, view: view.id, from: e.canvas },
      // While a point is being marked in this picture every press marks it:
      // it may lie right beside another mark.
      own =
        getRoom().next.kind === "link"
          ? null
          : nearest(view.id, at, radius, floor);
    if (own !== null) {
      grab = { ...start, point: own, moved: false };
      return true;
    }
    if (hit(at, radius, floor)) return false;
    grab = { ...start, point: tapRoom(view.id, at), moved: true };
    return true;
  }
  if (!grab || grab.id !== e.pointerId) return false;
  if (
    !grab.moved &&
    Math.hypot(e.canvas.x - grab.from.x, e.canvas.y - grab.from.y) >= TAP_TRAVEL
  )
    grab.moved = true;
  if (e.type === "move") {
    if (grab.moved) moveObs(grab.point, grab.view, at);
    return true;
  }
  const { point, view: held, moved } = grab;
  grab = null;
  if (e.cancelled) return true;
  if (moved) moveObs(point, held, at);
  else {
    // A tap on the outline's first corner closes it, as in Walls.
    const room = getRoom();
    if (!room.closed && room.outline[0] === point && room.outline.length >= 3)
      closeOutline(true);
    // Otherwise the tap placed nothing: say so, or it looks lost.
    else setNote({ held: point });
  }
  return true;
}
