/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Frame } from "../../vision/frame";
import type { Point } from "../../vision/types";

/** Read model output off the frame for the effects. Every reader returns an
 * empty list or null when its model is not running in the current mode, so an
 * effect degrades to whatever real inputs exist instead of failing. The
 * kind-specific payloads (`extra`) are checked by shape, not trusted. */
const NONE: Point[][] = [];

/** Hand landmark sets: from the hand model, or the gesture model's hands. */
export const handsOf = (frame: Frame): Point[][] =>
  frame.result?.tasks.hand?.landmarks ??
  frame.result?.tasks.gesture?.landmarks ??
  NONE;
export const posesOf = (frame: Frame): Point[][] =>
  frame.result?.tasks.pose?.landmarks ?? NONE;
export const facesOf = (frame: Frame): Point[][] =>
  frame.result?.tasks.face?.landmarks ?? NONE;

/** Measured blendshape scores (0..1 by name) of one face, or null. */
export function blendshapesOf(
  frame: Frame,
  face = 0,
): Record<string, number> | null {
  const all = frame.result?.tasks.face?.extra?.blendshapes;
  if (!Array.isArray(all)) return null;
  const one: unknown = all[face];
  return typeof one === "object" && one !== null
    ? (one as Record<string, number>)
    : null;
}
/** One blendshape score, or `fallback` when it was not measured. */
export function shape(
  shapes: Record<string, number> | null,
  name: string,
  fallback = 0,
) {
  const value = shapes?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** The segmenter's person matte: one byte per pixel, 255 where the model is
 * sure the pixel is not background, rows from the top left, not mirrored. */
export type Matte = { width: number; height: number; alpha: Uint8Array };
const matte: Matte = { width: 0, height: 0, alpha: new Uint8Array(0) };
/** The matte of the current result, or null when no segmenter is running.
 * The returned object is reused: read it, do not keep it. */
export function matteOf(frame: Frame): Matte | null {
  const extra = frame.result?.tasks.segment?.extra;
  if (!extra) return null;
  const { width, height, alpha } = extra;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !(alpha instanceof Uint8Array) ||
    width < 1 ||
    height < 1 ||
    alpha.length < width * height
  )
    return null;
  matte.width = width;
  matte.height = height;
  matte.alpha = alpha;
  return matte;
}

/** Image-normalized x and y to stage CSS pixels, mirror aware. The same maths
 * as frame.project, split in two so per-frame code allocates nothing. */
export const px = (frame: Frame, p: Point) =>
  frame.rect.x + (frame.mirror ? 1 - p.x : p.x) * frame.rect.w;
export const py = (frame: Frame, p: Point) => frame.rect.y + p.y * frame.rect.h;

/** Pose landmarks carry a visibility; hand and face landmarks do not. */
export const visible = (p: Point | undefined): p is Point =>
  !!p && (p.visibility ?? 1) > 0.4;

/** Distance between two landmarks in stage CSS pixels. */
export const span = (frame: Frame, a: Point, b: Point) =>
  Math.hypot((a.x - b.x) * frame.rect.w, (a.y - b.y) * frame.rect.h);
