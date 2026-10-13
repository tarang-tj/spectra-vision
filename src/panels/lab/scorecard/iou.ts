/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Box overlap for the scorecard, as COCO's scorer computes it. Boxes are in
// source pixels: x and y of the top left corner, then width and height.

export type Box = { x: number; y: number; w: number; h: number };

/** A box given as fractions of the picture (what the workers post) in the
 * picture's own pixels. */
export const toPixels = (box: Box, width: number, height: number): Box => ({
  x: box.x * width,
  y: box.y * height,
  w: box.w * width,
  h: box.h * height,
});

/** The area two boxes share. */
function shared(a: Box, b: Box): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Intersection over union: the shared area over the joined area. */
export function iou(a: Box, b: Box): number {
  const inter = shared(a, b);
  return inter > 0 ? inter / (a.w * a.h + b.w * b.h - inter) : 0;
}

/** Overlap of a box with a crowd region: the shared area over the box's own
 * area. A crowd region marks many objects at once, so a box on any part of
 * it is wholly "inside" however large the region is. */
export function crowdIou(box: Box, crowd: Box): number {
  const inter = shared(box, crowd);
  return inter > 0 ? inter / (box.w * box.h) : 0;
}
