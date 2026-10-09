/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pointer input for the Ruler. A press either grabs the nearest handle or
// places the next point, and the same press can keep dragging it, so a finger
// can place a point roughly and then refine it under the loupe.
import type { StagePointerEvent } from "../../stage/stage-hooks";
import { derive, longEdge } from "./derive";
import { TAP_SIGMA_SCREEN_PX } from "./monte-carlo";
import { view } from "./overlay";
import { getState, hit, move, place, setLock, type Handle } from "./store";

type Drag = { id: number; handle: Handle };
let drag: Drag | null = null;
/** Set by the panel: pauses the stage on a live source. */
let freeze: (() => void) | null = null;
export const setFreeze = (fn: (() => void) | null) => {
  freeze = fn;
};
export const endDrag = () => {
  drag = null;
  view.loupe = null;
  if (getState().lock) setLock(null);
};

const HIT_MOUSE = 12;
const HIT_TOUCH = 24;

export function onRulerPointer(e: StagePointerEvent): boolean {
  const at = { x: e.point.x * e.source.width, y: e.point.y * e.source.height };
  // One tap uncertainty, in source pixels, stored with every point it places.
  const sigma = TAP_SIGMA_SCREEN_PX / e.scale;
  if (e.type === "down") {
    // A second finger while a drag is in progress is ignored, so the first
    // finger's point is not replaced and its release still ends the drag.
    if (drag && drag.id !== e.pointerId) return true;
    if (!e.inside) return false;
    if (!view.still) {
      // A moving picture cannot be measured. The first tap freezes it.
      freeze?.();
      return true;
    }
    const radius =
      (e.pointerType === "mouse" ? HIT_MOUSE : HIT_TOUCH) / e.scale;
    drag = { id: e.pointerId, handle: hit(at, radius) ?? place(at, sigma) };
    // Hold the long-side guess for the whole drag.
    setLock(longEdge(derive(getState())));
    view.loupe = { at, canvas: e.canvas };
    return true;
  }
  if (!drag || drag.id !== e.pointerId) return false;
  if (e.type === "move") {
    move(drag.handle, at, sigma);
    view.loupe = { at, canvas: e.canvas };
    return true;
  }
  if (!e.cancelled) move(drag.handle, at, sigma);
  endDrag();
  return true;
}
