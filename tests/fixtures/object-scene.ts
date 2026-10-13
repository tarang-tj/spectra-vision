/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The floor of depth-scene.ts with an upright board standing on it, for the
// measured-objects tests. The board faces the camera, so its box, its depth
// at every pixel and its real size are all known exactly. Nothing here imports
// the code under test: the geometry is written out by hand.
//
// World: x right, y away from the camera along the floor, z up, mm.
// Camera: x right, y down, z forward.
import {
  FOCAL,
  HEIGHT,
  IMAGE,
  SCALE,
  SHIFT,
  TILT,
  floorDepthTruth,
  toCameraTruth,
} from "./depth-scene";

const CX = IMAGE.w / 2,
  CY = IMAGE.h / 2,
  COS = Math.cos(TILT),
  SIN = Math.sin(TILT);

export type Standing = {
  /** The board's left edge, mm. */
  x: number;
  /** How far along the floor it stands, mm. */
  y: number;
  /** Its width and its height, mm. */
  w: number;
  h: number;
};
/** A board 600 mm wide and 1000 mm tall, 3 m ahead, centred. */
export const UPRIGHT: Standing = { x: -300, y: 3000, w: 600, h: 1000 };

type P = { x: number; y: number };
const shoot3 = (x: number, y: number, z: number): P => {
  const p = toCameraTruth(x, y, z);
  return { x: CX + (FOCAL * p.x) / p.z, y: CY + (FOCAL * p.y) / p.z };
};

/** Where the ray through a picture pixel meets the board's plane: the world
 * point and its depth along the camera's axis, or null when it never does. */
function onPlane(board: Standing, u: number, v: number) {
  const dx = (u - CX) / FOCAL,
    dy = (v - CY) / FOCAL,
    // World y of the ray per mm of depth: forward is (0, cos, -sin) and
    // down is (0, -sin, -cos).
    along = COS - SIN * dy;
  if (along <= 1e-9) return null;
  const depth = board.y / along;
  return { x: depth * dx, z: HEIGHT - depth * (COS * dy + SIN), depth };
}

/** The board's depth at a pixel, or null where the pixel is not on it. */
export function boardDepthTruth(
  board: Standing,
  u: number,
  v: number,
): number | null {
  const hit = onPlane(board, u, v);
  return hit &&
    hit.x >= board.x &&
    hit.x <= board.x + board.w &&
    hit.z >= 0 &&
    hit.z <= board.h
    ? hit.depth
    : null;
}

/** The scene with one standing board: its picture corners, its bounding box
 * (image-normalised, clipped to the picture), and the truth. */
export function standingScene(board: Standing = UPRIGHT) {
  const corners = [
      shoot3(board.x, board.y, 0),
      shoot3(board.x + board.w, board.y, 0),
      shoot3(board.x + board.w, board.y, board.h),
      shoot3(board.x, board.y, board.h),
    ],
    clip = (value: number, most: number) => Math.min(most, Math.max(0, value)),
    left = clip(Math.min(...corners.map((c) => c.x)), IMAGE.w),
    right = clip(Math.max(...corners.map((c) => c.x)), IMAGE.w),
    top = clip(Math.min(...corners.map((c) => c.y)), IMAGE.h),
    bottom = clip(Math.max(...corners.map((c) => c.y)), IMAGE.h),
    box = {
      x: left / IMAGE.w,
      y: top / IMAGE.h,
      w: (right - left) / IMAGE.w,
      h: (bottom - top) / IMAGE.h,
    },
    centre = { x: (left + right) / 2, y: (top + bottom) / 2 },
    hit = onPlane(board, centre.x, centre.y)!,
    // The depths of the board's top and bottom edge, for the keystone.
    topDepth = toCameraTruth(0, board.y, board.h).z,
    bottomDepth = toCameraTruth(0, board.y, 0).z;
  return {
    board,
    corners,
    box,
    /** Box edges in picture pixels. */
    edges: { left, right, top, bottom, centre },
    truth: {
      /** Straight line from the camera to where the box-centre ray meets the
       * board, mm. */
      distance:
        hit.depth *
        Math.hypot((centre.x - CX) / FOCAL, (centre.y - CY) / FOCAL, 1),
      /** Depth along the camera's axis at that point, mm. */
      depth: hit.depth,
      width: board.w,
      height: board.h,
      topDepth,
      bottomDepth,
    },
  };
}

/** The model's output for a depth, behind the fixture's hidden scale and shift. */
export const outputFor = (depth: number) =>
  Math.max(0, (1 / depth - SHIFT) / SCALE);

/** A depth map of the floor with the board standing on it, as a relative
 * model would give it, with optional noise as a share of each value.
 * `objectError` is the share by which the model misjudges the board's depth
 * while reading the floor right: an error no fit to the floor can see.
 * `open` is a part of the board that is not there (the gap under a table):
 * the floor behind shows through it. */
export function sceneMap(
  width: number,
  height: number,
  board: Standing = UPRIGHT,
  noiseShare = 0,
  noise: () => number = () => 0,
  objectError = 0,
  open?: Standing,
) {
  const values = new Float32Array(width * height);
  let min = Infinity,
    max = -Infinity;
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const u = ((col + 0.5) / width) * IMAGE.w,
        v = ((row + 0.5) / height) * IMAGE.h,
        onBoard =
          open && boardDepthTruth(open, u, v) !== null
            ? null
            : boardDepthTruth(board, u, v),
        depth =
          onBoard === null
            ? floorDepthTruth(u, v)
            : onBoard * (1 + objectError),
        clean = depth === null ? 0 : outputFor(depth),
        value = clean * (1 + noiseShare * noise());
      values[row * width + col] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  return { width, height, values, min, max };
}

/** The camera the fixture was drawn with, in the shape the code under test
 * takes one: focal length, principal point, and world to camera rotation
 * (row-major) whose third column is "up". */
export const TRUE_CAMERA = {
  f: FOCAL,
  cx: CX,
  cy: CY,
  r: [1, 0, 0, 0, -SIN, -COS, 0, COS, -SIN],
};
