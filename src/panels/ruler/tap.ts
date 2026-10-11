/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a press on the stage means in the picture. One copy for the Ruler and
// the tools in its folders, so the grab radius is changed in one place. Pure.
import type { StagePointerEvent } from "../../stage/stage-hooks";

/** How near a press must be to a handle to grab it, canvas CSS pixels. */
export const HIT_MOUSE = 12,
  HIT_TOUCH = 24;

/** The smallest grab radius a crowded handle keeps, canvas CSS pixels. */
export const FLOOR_MOUSE = 5,
  FLOOR_TOUCH = 8;
/** A handle's grab radius is at most this share of the distance to the
 * nearest other handle, so two grab discs never overlap and the space
 * between two close handles stays free for a tap that places a point. */
export const SPACING_SHARE = 0.4;
/** A press that grabbed a handle moves it only after travelling this far,
 * canvas CSS pixels: a plain tap on a handle leaves it where it was. */
export const TAP_TRAVEL = 4;

/** The grab radius of this press, in source pixels. */
export const hitRadius = (e: StagePointerEvent): number =>
  (e.pointerType === "mouse" ? HIT_MOUSE : HIT_TOUCH) / e.scale;

/** The least radius a handle keeps for this press, in source pixels. */
export const hitFloor = (e: StagePointerEvent): number =>
  (e.pointerType === "mouse" ? FLOOR_MOUSE : FLOOR_TOUCH) / e.scale;

/** The radius within which a press grabs a handle whose nearest other handle
 * is `spacing` away (all in the same unit). */
export const grabRadius = (
  radius: number,
  floor: number,
  spacing: number,
): number =>
  Math.max(Math.min(floor, radius), Math.min(radius, SPACING_SHARE * spacing));

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
