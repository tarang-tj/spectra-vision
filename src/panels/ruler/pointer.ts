/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Pointer input for the Ruler. While something is part built a press places
// its next point. Otherwise a press grabs the handle it lands on, or places a
// point. The same press can go on dragging what it placed or grabbed, so a
// finger can place a point roughly and then refine it under the loupe. A
// grabbed handle moves only once the press has travelled: a tap leaves it.
// With Path or Area chosen that tap is the first point of a new shape, put
// where the finger was: an outline may start right beside a handle, and a
// tap that silently made no point would close the outline one corner short.
import type { StagePointerEvent } from "../../stage/stage-hooks";
import { derive, longEdge } from "./derive";
import { extensionFor, extensionPointer } from "./extensions";
import { TAP_SIGMA_SCREEN_PX } from "./monte-carlo";
import { view } from "./overlay";
import {
  building,
  getState,
  hit,
  move,
  place,
  set,
  type Handle,
} from "./store";
import { hitFloor, hitRadius, tapPixel, TAP_TRAVEL } from "./tap";

type Drag = {
  id: number;
  handle: Handle;
  /** Where the press went down, canvas CSS pixels. */
  from: { x: number; y: number };
  /** The press grabbed a handle that was already there. */
  grabbed: boolean;
  /** The handle follows the press: at once for a point this press placed,
   * after `TAP_TRAVEL` for one it grabbed. */
  moving: boolean;
};
let drag: Drag | null = null;
export const endDrag = () => {
  const d = drag,
    s = getState();
  drag = null;
  view.loupe = null;
  // A grab that moved nothing stays on the step line; a real drag does not.
  const grab =
    d && d.grabbed && !d.moving ? { handle: d.handle, held: false } : null;
  if (s.lock || s.grab) set({ lock: null, grab });
};
/** True once the press has travelled far enough to be a drag, not a tap. */
function travelled(d: Drag, e: StagePointerEvent): boolean {
  if (!d.moving)
    d.moving =
      Math.hypot(e.canvas.x - d.from.x, e.canvas.y - d.from.y) >= TAP_TRAVEL;
  return d.moving;
}

/** True when a press that took hold of a handle and never travelled is the
 * first point of a path or outline: one of those tools is chosen, and (as
 * `building` was false when the press grabbed) no shape of it is open. */
function startsShape(d: Drag): boolean {
  const { tool, corners } = getState();
  return (
    d.grabbed &&
    !d.moving &&
    view.still &&
    corners.length === 4 &&
    (tool === "path" || tool === "area")
  );
}

export function onRulerPointer(e: StagePointerEvent): boolean {
  const at = tapPixel(e);
  // One tap uncertainty, in source pixels, stored with every point it places.
  const sigma = TAP_SIGMA_SCREEN_PX / e.scale;
  // A tool from its own folder sees the event first, unless one of the
  // Ruler's own handles is being dragged: a second finger is ignored then,
  // as it is without a tool.
  // It needs the reference, so until all four corners are placed (at the
  // start, or after Clear) taps go on placing corners as usual.
  const ext =
    getState().corners.length === 4 ? extensionFor(getState().tool) : null;
  if (ext && view.still && !drag) {
    if (extensionPointer(ext, e)) {
      view.loupe = e.type === "up" ? null : { at, canvas: e.canvas };
      return true;
    }
  }
  if (e.type === "down") {
    // A second finger while a drag is in progress is ignored, so the first
    // finger's point is not replaced and its release still ends the drag.
    if (drag && drag.id !== e.pointerId) return true;
    if (!e.inside) return false;
    // A moving picture cannot be measured; the panel stops listening for
    // taps then, and this guards the frame between the two.
    if (!view.still) return false;
    // With an extension tool chosen a press never places a Ruler point, but
    // it may still grab one, so the reference stays adjustable.
    const grabbed =
        !ext && building(getState())
          ? null
          : hit(at, hitRadius(e), hitFloor(e)),
      handle = grabbed ?? (ext ? null : place(at, sigma));
    if (!handle) return false;
    drag = {
      id: e.pointerId,
      handle,
      from: e.canvas,
      grabbed: !!grabbed,
      moving: !grabbed,
    };
    // Hold the long-side guess for the whole drag.
    set({
      lock: longEdge(derive(getState())),
      grab: grabbed ? { handle: grabbed, held: true } : null,
    });
    view.loupe = { at, canvas: e.canvas };
    return true;
  }
  if (!drag || drag.id !== e.pointerId) return false;
  if (e.type === "move") {
    if (travelled(drag, e)) move(drag.handle, at, sigma);
    view.loupe = { at, canvas: e.canvas };
    return true;
  }
  if (!e.cancelled && travelled(drag, e)) move(drag.handle, at, sigma);
  else if (!e.cancelled && startsShape(drag)) {
    place(at, sigma);
    // It placed a point after all, so there is no grab to report.
    drag.grabbed = false;
  }
  endDrag();
  return true;
}
