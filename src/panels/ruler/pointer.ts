/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pointer input for the Ruler. A press either grabs the nearest handle or
// places the next point, and the same press can keep dragging it, so a finger
// can place a point roughly and then refine it under the loupe.
import type { StagePointerEvent } from "../../stage/stage-hooks";
import { view } from "./overlay";
import { hit, move, place, type Handle } from "./store";

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
};

const HIT_MOUSE = 12;
const HIT_TOUCH = 24;

export function onRulerPointer(e: StagePointerEvent): boolean {
  const at = { x: e.point.x * e.source.width, y: e.point.y * e.source.height };
  if (e.type === "down") {
    if (!e.inside) return false;
    if (!view.still) {
      // A moving picture cannot be measured. The first tap freezes it.
      freeze?.();
      return true;
    }
    const radius =
      (e.pointerType === "mouse" ? HIT_MOUSE : HIT_TOUCH) / e.scale;
    drag = { id: e.pointerId, handle: hit(at, radius) ?? place(at) };
    view.loupe = { at, canvas: e.canvas };
    return true;
  }
  if (!drag || drag.id !== e.pointerId) return false;
  if (e.type === "move") {
    move(drag.handle, at);
    view.loupe = { at, canvas: e.canvas };
    return true;
  }
  if (!e.cancelled) move(drag.handle, at);
  endDrag();
  return true;
}
