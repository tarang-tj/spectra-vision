/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Metric scale for the depth map, from the Ruler. Where the Ruler has a
// solved reference on the same photo, every depth-map cell inside the
// reference or inside a finished Area outline is floor the user marked, and
// its real depth follows from the Ruler's plane and camera. A fit of the
// model's output against those depths (vision/depth/affine-fit.ts) then puts
// the whole map in millimetres. Reads the Ruler's state; never changes it.
import { toCamera, type Camera } from "../../measure/camera";
import { cameraOf } from "../../panels/ruler/camera-of";
import { derive, type Derived } from "../../panels/ruler/derive";
import {
  applyHomography,
  orderCorners,
  type Mat3,
  type Pt,
} from "../../panels/ruler/homography";
import { applyLens } from "../../panels/ruler/lens";
import { plumbVersion } from "../../panels/ruler/plumbs";
import { getState, type RulerState } from "../../panels/ruler/state";
import {
  fitDepth,
  type DepthFit,
  type FitSample,
} from "../../vision/depth/affine-fit";
import { cellCentre } from "../../vision/depth/unproject";
import type { DepthExtra, Source } from "../../vision/types";

/** A marked floor cell: the model's output there and where it is in the flat
 * (lens-corrected) picture, in source pixels. */
export type FloorCell = { output: number; flat: Pt };

export type MetricScale = {
  metric: true;
  fit: DepthFit;
  camera: Camera;
  /** Source pixel to the flat picture the camera describes. */
  flatten(p: Pt): Pt;
  /** Marked floor cells in the depth map, before thinning. */
  floorCells: number;
  /** The thinned cells the fit used, for the error bar's retakes. */
  cells: FloorCell[];
  s: RulerState;
  d: Derived;
};
export type RelativeScale = {
  metric: false;
  /** Why, and what the user can do, in one or two sentences. */
  reason: string;
};
export type DepthScale = MetricScale | RelativeScale;

/** Most floor cells handed to the fit. */
const MAX_FIT_CELLS = 2500;

const NO_REFERENCE =
  "Relative depth: order and shape, no lengths. For metres, open the Ruler on a photo, tap a reference lying on the floor, then outline a patch of floor from near to far with the Area tool.";
const REASONS = {
  few: "Too few depth-map cells fall on the floor marked in the Ruler. Outline a larger patch of floor with the Area tool.",
  span: "The floor marked in the Ruler sits at nearly one depth (its far edge is under 1.3 times as far as its near edge), which cannot fix both the scale and the shift of the depth map. Outline a patch of floor from near to far with the Ruler's Area tool. Staying relative.",
  flat: "The depth map reads the same over the whole marked floor, so it cannot be scaled. Staying relative.",
  inverted:
    "The depth map reads the near end of the marked floor as farther than its far end, so it is not scaled. Check that the Ruler's reference and outline lie on the floor.",
  scatter:
    "The depth map does not follow the marked floor closely enough to be scaled (over 25% scatter). Check that the reference and the outline lie on the floor with nothing standing on them.",
};

function inside(p: Pt, polygon: readonly Pt[]): boolean {
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

function compute(
  extra: DepthExtra,
  generation: number,
  source: Source | null,
  s: RulerState,
): DepthScale {
  if (s.generation !== generation || !s.source || s.corners.length < 4)
    return { metric: false, reason: NO_REFERENCE };
  // The stage runs no model while paused, so on a paused video the map is of
  // an earlier frame than the one the Ruler froze.
  if (!source || !("naturalWidth" in source.element))
    return {
      metric: false,
      reason:
        "Relative depth. Metric scale needs a photo: on a paused video or camera the depth map comes from an earlier frame than the one the Ruler froze.",
    };
  const d = derive(s),
    camera = cameraOf(s, d);
  if (!d.sheet || !camera)
    return {
      metric: false,
      reason:
        "Relative depth. The Ruler's reference is not solved yet: finish its four corners.",
    };
  if (!camera.focalResolved)
    return {
      metric: false,
      reason:
        "Relative depth. This picture does not pin down the camera's focal length, which the 3D positions need. Tilt the camera so the reference shows perspective, or mark a plumb edge in the Ruler.",
    };
  const polygons = floorPolygons(s, d),
    { width, height, values } = extra,
    flatten = (p: Pt) => applyLens(d.lens, p),
    found: FloorCell[] = [];
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const p = cellCentre(col, row, width, height, s.source.w, s.source.h);
      if (polygons.some((polygon) => inside(p, polygon)))
        found.push({ output: values[row * width + col], flat: flatten(p) });
    }
  const step = Math.max(1, Math.ceil(found.length / MAX_FIT_CELLS)),
    cells = found.filter((_, i) => i % step === 0),
    fit = fitDepth(samplesFor(cells, d.sheet.h, camera));
  if (!fit.ok) return { metric: false, reason: REASONS[fit.reason] };
  return {
    metric: true,
    fit,
    camera,
    flatten,
    floorCells: found.length,
    cells,
    s,
    d,
  };
}

/** A cheap fingerprint of a map. A still photo gives the same map on every
 * run, and the fit need not be repeated for it. */
function fingerprint(extra: DepthExtra): string {
  const { values } = extra,
    step = Math.max(1, Math.floor(values.length / 64));
  let sum = 0;
  for (let i = 0; i < values.length; i += step) sum += values[i] * (1 + i);
  return `${extra.width}x${extra.height}:${extra.min}:${extra.max}:${sum}`;
}

let memo: {
  print: string;
  generation: number;
  s: RulerState;
  plumbs: number;
  element: unknown;
  value: DepthScale;
} | null = null;

/** The scale of this depth map: metric with its fit, or relative with the
 * reason. Memoized on the map, the Ruler's state and the plumb edges, so it
 * is cheap to call every frame. */
export function depthScale(
  extra: DepthExtra,
  generation: number,
  source: Source | null,
): DepthScale {
  const s = getState(),
    print = fingerprint(extra),
    plumbs = plumbVersion(),
    element = source?.element ?? null;
  if (
    memo &&
    memo.print === print &&
    memo.generation === generation &&
    memo.s === s &&
    memo.plumbs === plumbs &&
    memo.element === element
  )
    return memo.value;
  const value = compute(extra, generation, source, s);
  memo = { print, generation, s, plumbs, element, value };
  return value;
}
