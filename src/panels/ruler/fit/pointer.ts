/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pointer input for the Box tool. A press on the floor stands the box there,
// a press inside its footprint drags it, and a press on its turn handle turns
// it. One pointer at a time: a new press takes over, so a press whose release
// never arrived cannot leave the tool stuck. Events it does not use are left
// to the Ruler.
import type { StagePointerEvent } from "../../../stage/stage-hooks";
import type { ExtensionEnv } from "../extension-types";
import { applyHomography } from "../homography";
import { onPointsCleared } from "../state";
import { hit } from "../store";
import { cancelEdit, getBox, sealEdit, setBox, wrapDegrees } from "./box-state";
import { TURN_CORNER } from "./draw";
import { containsPoint, footprintCorners, type P } from "./geometry";
import { projectorOf } from "./project";

type Drag =
  | { id: number; kind: "move"; dx: number; dy: number }
  | { id: number; kind: "turn"; base: number };
let drag: Drag | null = null;
/** Forget a drag in progress (the picture's points were cleared; tests). */
export const endBoxDrag = () => {
  drag = null;
};
onPointsCleared(endBoxDrag);

// The same reach as the Ruler's own handles, canvas CSS pixels.
const HIT_MOUSE = 12;
const HIT_TOUCH = 24;
const TAG = "drag";

/** Where the pointer is on the plane, mm; null at or beyond the horizon. */
function onPlane(e: StagePointerEvent, env: ExtensionEnv): P | null {
  if (!env.d.sheet) return null;
  return applyHomography(
    env.d.sheet.h,
    env.flat({
      x: e.point.x * e.source.width,
      y: e.point.y * e.source.height,
    }),
  );
}

const angleFrom = (c: P, p: P) =>
  (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;

function press(e: StagePointerEvent, env: ExtensionEnv): boolean {
  if (!e.inside || !env.d.sheet) return false;
  const tap = { x: e.point.x * e.source.width, y: e.point.y * e.source.height },
    reach = (e.pointerType === "mouse" ? HIT_MOUSE : HIT_TOUCH) / e.scale,
    box = getBox(),
    at = box.at,
    plane = onPlane(e, env);
  if (at) {
    const foot = footprintCorners({ ...box, ...at }),
      corner = foot[TURN_CORNER],
      view = projectorOf(env),
      flat = view?.project(corner.x, corner.y, 0),
      handle = flat ? env.unflat(flat) : null;
    if (
      handle &&
      plane &&
      Math.hypot(handle.x - tap.x, handle.y - tap.y) <= reach
    ) {
      // Turn about the centre, keeping the angle between pointer and corner.
      drag = {
        id: e.pointerId,
        kind: "turn",
        base: box.rot - angleFrom(at, plane),
      };
      sealEdit();
      return true;
    }
    // One of the Ruler's own handles under the pointer: leave it adjustable.
    if (hit(tap, reach)) return false;
    if (plane && containsPoint(plane, foot)) {
      drag = {
        id: e.pointerId,
        kind: "move",
        dx: at.x - plane.x,
        dy: at.y - plane.y,
      };
      sealEdit();
      return true;
    }
  } else if (hit(tap, reach)) return false;
  if (!plane) return false;
  // Stand the box here; the same press can go on to drag it.
  sealEdit();
  setBox({ at: plane }, TAG);
  drag = { id: e.pointerId, kind: "move", dx: 0, dy: 0 };
  return true;
}

export function onBoxPointer(e: StagePointerEvent, env: ExtensionEnv): boolean {
  if (e.type === "down") return press(e, env);
  if (!drag || drag.id !== e.pointerId) return false;
  const box = getBox(),
    plane = onPlane(e, env);
  if (e.type === "up" && e.cancelled) cancelEdit(TAG);
  else if (plane && box.at) {
    if (drag.kind === "move") {
      const at = { x: plane.x + drag.dx, y: plane.y + drag.dy };
      if (at.x !== box.at.x || at.y !== box.at.y) setBox({ at }, TAG);
    } else {
      const rot =
        Math.round(wrapDegrees(drag.base + angleFrom(box.at, plane)) * 10) / 10;
      if (rot !== box.rot) setBox({ rot }, TAG);
    }
  }
  if (e.type === "up") {
    drag = null;
    sealEdit();
  }
  return true;
}
