/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A detector's box placed in the room: which depth-map cells stand for it,
// and the distance and box size that follow from one depth and the camera.
// The size is the box's, at the depth of what is in its middle. It is never
// the object's outline. Pure: no DOM, no clock, no Ruler state.
import { SHARPER_MODEL, SHARPER_SIZE } from "../vision/detector/sharper";
import type { Box, MapRect } from "../vision/types";
import type { Camera } from "./camera";
import { column } from "./vec";

/** A box narrower or shorter than this many map cells is not measured: two of
 * the depth model's 14 pixel patches, so its middle half spans a whole one. */
export const MIN_BOX_CELLS = 28;
/** The sample's own spread in depth, as a share of its median depth, above
 * which the middle of the box holds more than one thing. */
export const MAX_SPREAD = 0.25;
/** How many times past the marked floor's far edge (or short of its near
 * edge) the fit is still read. */
export const REACH = 1.5;
/** Added to every bar for the depth model's error away from the floor the
 * fit was made on. Twice the model's published mean relative error on indoor
 * pictures (AbsRel 0.053, NYU Depth v2, Depth Anything V2 ViT-S). It is an
 * allowance: nothing here measures it on the picture at hand. */
export const OFF_FLOOR_ALLOWANCE = 0.11;

/** The square each detector resizes the picture to, by model file. */
export const DETECTOR_SIDE: Readonly<Record<string, number>> = {
  "efficientdet_lite0.tflite": 320,
  "efficientdet_lite2.tflite": 448,
  [SHARPER_MODEL]: SHARPER_SIZE,
};
/** A file not in the table is taken as the coarsest. */
export const detectorSide = (model: string | undefined): number =>
  (model && DETECTOR_SIDE[model]) || 320;

type Pt = { x: number; y: number };
type DepthMap = {
  width: number;
  height: number;
  values: Float32Array;
  content?: MapRect;
};

export type BoxSample = {
  /** The box's size in whole map cells. */
  cols: number;
  rows: number;
  /** False when the box reaches outside the cells that are picture. */
  inside: boolean;
  /** Cells in the sample. */
  cells: number;
  /** The model's output over the sample: its median, and its 16th and 84th
   * percentile. NaN when the sample is empty. */
  median: number;
  low: number;
  high: number;
};

const at = (sorted: Float32Array, q: number) =>
  sorted.length ? sorted[Math.round(q * (sorted.length - 1))] : NaN;

/** The cells whose centres fall in the middle half of the box in each
 * direction (the central quarter of its area). A box is not an outline: its
 * rim holds floor and background, its middle mostly the object. */
export function sampleBox(map: DepthMap, box: Box): BoxSample {
  const { width, height, values } = map,
    c = map.content ?? { x: 0, y: 0, width, height },
    left = box.x * width,
    right = (box.x + box.w) * width,
    top = box.y * height,
    bottom = (box.y + box.h) * height,
    // Half a cell of slack: a box drawn to the picture's edge is inside it.
    inside =
      left >= c.x - 0.5 &&
      top >= c.y - 0.5 &&
      right <= c.x + c.width + 0.5 &&
      bottom <= c.y + c.height + 0.5,
    // A cell centre sits at index + 0.5.
    from = (edge: number) => Math.max(0, Math.ceil(edge - 0.5)),
    to = (edge: number, most: number) =>
      Math.min(most - 1, Math.floor(edge - 0.5)),
    c0 = from(left + (right - left) / 4),
    c1 = to(right - (right - left) / 4, width),
    r0 = from(top + (bottom - top) / 4),
    r1 = to(bottom - (bottom - top) / 4, height),
    picked = new Float32Array(
      Math.max(0, c1 - c0 + 1) * Math.max(0, r1 - r0 + 1),
    );
  let n = 0;
  for (let row = r0; row <= r1; row++)
    for (let col = c0; col <= c1; col++)
      picked[n++] = values[row * width + col];
  picked.sort();
  return {
    cols: Math.floor(right - left + 1e-9),
    rows: Math.floor(bottom - top + 1e-9),
    inside,
    cells: n,
    median: at(picked, 0.5),
    low: at(picked, 0.16),
    high: at(picked, 0.84),
  };
}

/** Where the box's centre and the middle of each edge are in the flat
 * (lens-corrected) picture the camera describes, in source pixels. */
export type BoxEdges = { left: Pt; right: Pt; top: Pt; bottom: Pt; centre: Pt };
export function boxEdges(
  box: Box,
  width: number,
  height: number,
  flatten: (p: Pt) => Pt,
): BoxEdges {
  const l = box.x * width,
    r = (box.x + box.w) * width,
    t = box.y * height,
    b = (box.y + box.h) * height,
    cx = (l + r) / 2,
    cy = (t + b) / 2;
  return {
    left: flatten({ x: l, y: cy }),
    right: flatten({ x: r, y: cy }),
    top: flatten({ x: cx, y: t }),
    bottom: flatten({ x: cx, y: b }),
    centre: flatten({ x: cx, y: cy }),
  };
}

export type BoxGeometry = {
  /** Straight line from the camera to the point at the box's centre. */
  distance: number;
  /** The box's extent across the view at that depth. */
  width: number;
  /** The plumb line through that point, from the box's bottom edge to its
   * top edge; null when the camera looks along it. */
  height: number | null;
  /** Half the difference in depth between the two ends of that plumb line,
   * as a share of the depth: how much an upright thing's width in pixels
   * changes from top to bottom. Null with no height. */
  keystone: number | null;
};

/** Distance and box size for a depth `z` along the camera's axis, in the
 * unit of `z`. Camera frame: x right, y down, z forward. */
export function boxGeometry(
  camera: Pick<Camera, "f" | "cx" | "cy" | "r">,
  edges: BoxEdges,
  z: number,
): BoxGeometry {
  const { f, cx, cy } = camera,
    nx = (edges.centre.x - cx) / f,
    ny = (edges.centre.y - cy) / f,
    // The point the depth stands for, on the ray through the box's centre.
    my = z * ny,
    // World "up" in camera coordinates.
    up = column(camera.r, 2),
    // How far along the plumb line through that point picture row `v` is.
    along = (v: number): number | null => {
      const den = f * up[1] - (v - cy) * up[2];
      if (!(Math.abs(den) >= 1e-6 * f)) return null;
      const s = ((v - cy) * z - f * my) / den;
      // Behind the camera: the line does not show at this row.
      return z + s * up[2] > 0 ? s : null;
    },
    st = along(edges.top.y),
    sb = along(edges.bottom.y),
    tall = st !== null && sb !== null;
  return {
    distance: z * Math.hypot(nx, ny, 1),
    width: (z * Math.abs(edges.right.x - edges.left.x)) / f,
    height: tall ? Math.abs(st - sb) : null,
    keystone: tall ? Math.abs((st - sb) * up[2]) / (2 * z) : null,
  };
}
