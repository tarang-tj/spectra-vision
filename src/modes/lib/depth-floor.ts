/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The floor the user marked in the Ruler, for the depth map's metric fit:
// which picture regions are floor, and how deep the floor is under a pixel.
import { toCamera, type Camera } from "../../measure/camera";
import type { Derived } from "../../panels/ruler/derive";
import {
  applyHomography,
  orderCorners,
  type Mat3,
  type Pt,
} from "../../panels/ruler/homography";
import type { RulerState } from "../../panels/ruler/state";
import type { FitSample } from "../../vision/depth/affine-fit";

/** A marked floor cell: the model's output there and where it is in the flat
 * (lens-corrected) picture, in source pixels. */
export type FloorCell = { output: number; flat: Pt };

/** True when a point is inside a polygon (even-odd rule). */
export function insidePolygon(p: Pt, polygon: readonly Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      hit = !hit;
  }
  return hit;
}

/** Everything the user marked as floor, as polygons in source pixels: the
 * reference, further references, and finished Area outlines. */
export function floorPolygons(s: RulerState, d: Derived): Pt[][] {
  const out: Pt[][] = [];
  if (d.sheet) out.push(d.sheet.raw ?? d.sheet.ordered);
  for (const ref of s.extraRefs)
    if (ref.corners.length === 4) out.push(orderCorners(ref.corners));
  for (const shape of s.shapes)
    if (shape.kind === "area" && shape.done) out.push(shape.pts);
  return out;
}

/** The real depth (mm along the camera axis) of the floor under a flat
 * picture point, or null beyond the horizon or behind the camera. */
export function floorDepth(h: Mat3, camera: Camera, flat: Pt): number | null {
  const plane = applyHomography(h, flat);
  if (!plane) return null;
  const z = toCamera(camera, plane.x, plane.y, 0)[2];
  return Number.isFinite(z) && z > 0 ? z : null;
}

/** Fit samples for one plane map and camera (the Ruler's own, or a retake). */
export function samplesFor(
  cells: readonly FloorCell[],
  h: Mat3,
  camera: Camera,
): FitSample[] {
  const out: FitSample[] = [];
  for (const cell of cells) {
    const depth = floorDepth(h, camera, cell.flat);
    if (depth !== null) out.push({ output: cell.output, depth });
  }
  return out;
}
