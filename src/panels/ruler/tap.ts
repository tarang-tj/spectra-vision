/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a press on the stage means in the picture. One copy for the Ruler and
// the tools in its folders, so the grab radius is changed in one place. Pure.
import type { StagePointerEvent } from "../../stage/stage-hooks";

/** How near a press must be to a handle to grab it, canvas CSS pixels. */
export const HIT_MOUSE = 12,
  HIT_TOUCH = 24;

/** The grab radius of this press, in source pixels. */
export const hitRadius = (e: StagePointerEvent): number =>
  (e.pointerType === "mouse" ? HIT_MOUSE : HIT_TOUCH) / e.scale;

/** Where the press is, in source pixels. */
export const tapPixel = (e: StagePointerEvent): { x: number; y: number } => ({
  x: e.point.x * e.source.width,
  y: e.point.y * e.source.height,
});

/** The point moved onto a picture of `size` source pixels. */
export const onPicture = (
  p: { x: number; y: number },
  size: { w: number; h: number },
): { x: number; y: number } => ({
  x: Math.min(size.w, Math.max(0, p.x)),
  y: Math.min(size.h, Math.max(0, p.y)),
});
