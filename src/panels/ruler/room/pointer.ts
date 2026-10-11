/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Stage presses while the Room tool is chosen. A press grabs one of the
// room's own marks in this picture, or makes the next one, and the same
// press can go on dragging it. A press on one of the Ruler's own handles is
// left to the Ruler, so the reference stays adjustable.
import type { StagePointerEvent } from "../../../stage/stage-hooks";
import type { ExtensionEnv } from "../extension-types";
import type { Pt } from "../homography";
import { TAP_SIGMA_SCREEN_PX } from "../monte-carlo";
import { hit, onPointsCleared } from "../store";
import { hitRadius, tapPixel, TAP_TRAVEL } from "../tap";
import { stageView } from "./current";
import { closeOutline, getRoom, moveObs, tapRoom } from "./store";

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

function nearest(view: number, at: Pt, radius: number): number | null {
  let best: number | null = null,
    bestD = radius;
  for (const p of getRoom().points) {
    const o = p.obs.find((x) => x.view === view);
    if (!o) continue;
    const d = Math.hypot(o.at.x - at.x, o.at.y - at.y);
    if (d <= bestD) {
      bestD = d;
      best = p.id;
    }
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
      start = { id: e.pointerId, view: view.id, from: e.canvas },
      // While a point is being marked in this picture every press marks it:
      // it may lie right beside another mark.
      own =
        getRoom().next.kind === "link" ? null : nearest(view.id, at, radius);
    if (own !== null) {
      grab = { ...start, point: own, moved: false };
      return true;
    }
    if (hit(at, radius)) return false;
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
  }
  return true;
}
