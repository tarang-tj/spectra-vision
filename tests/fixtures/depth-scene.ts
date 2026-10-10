/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A synthetic photo of a flat floor for the Depth tests, with exact truth. The
// camera stands `HEIGHT` mm above the floor and looks down by `TILT`. Nothing
// here imports the code under test: the geometry is written out by hand.
//
// World: x right, y away from the camera along the floor, z up, mm.
// Camera: x right, y down, z forward.

export const IMAGE = { w: 1600, h: 1200 };
export const FOCAL = 1300;
export const HEIGHT = 1500;
export const TILT = (32 * Math.PI) / 180;
const CX = IMAGE.w / 2,
  CY = IMAGE.h / 2,
  COS = Math.cos(TILT),
  SIN = Math.sin(TILT);

export type P = { x: number; y: number };

/** A floor point (mm) in camera coordinates. */
export const toCameraTruth = (x: number, y: number, z = 0) => ({
  x,
  // down = (0, -sin, -cos), forward = (0, cos, -sin), from the camera centre.
  y: -SIN * y - COS * (z - HEIGHT),
  z: COS * y - SIN * (z - HEIGHT),
});

/** Where a floor point lands in the picture. */
export function shoot(x: number, y: number): P {
  const p = toCameraTruth(x, y);
  return { x: CX + (FOCAL * p.x) / p.z, y: CY + (FOCAL * p.y) / p.z };
}

/** The depth (mm along the camera axis) of the floor seen at a picture
 * pixel, or null at and above the horizon. */
export function floorDepthTruth(_u: number, v: number): number | null {
  const fall = (COS * (v - CY)) / FOCAL + SIN;
  return fall > 1e-9 ? HEIGHT / fall : null;
}

/** How far above the floor a camera-frame point is (0 on the floor). */
export const heightTruth = (p: { x: number; y: number; z: number }) =>
  HEIGHT - COS * p.y - SIN * p.z;

/** The inverse-depth scale and shift the synthetic "model" hides its depths
 * behind: output = (1 / depth - SHIFT) / SCALE. */
export const SCALE = 2.4e-4;
export const SHIFT = 6e-5;

/** A depth map of the floor as a relative model would give it: affine in
 * inverse depth, zero above the horizon, with optional noise from `noise()`
 * (a standard normal) as a share of each value. */
export function floorMap(
  width: number,
  height: number,
  noiseShare = 0,
  noise: () => number = () => 0,
) {
  const values = new Float32Array(width * height);
  let min = Infinity,
    max = -Infinity;
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const depth = floorDepthTruth(
          ((col + 0.5) / width) * IMAGE.w,
          ((row + 0.5) / height) * IMAGE.h,
        ),
        clean = depth === null ? 0 : Math.max(0, (1 / depth - SHIFT) / SCALE),
        value = clean * (1 + noiseShare * noise());
      values[row * width + col] = value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
  return { width, height, values, min, max };
}

/** A 1000 x 700 mm board lying on the floor ahead of the camera. */
export const BOARD = { x: -500, y: 1500, w: 1000, h: 700 };
export const boardCorners = (): P[] =>
  [
    [BOARD.x, BOARD.y],
    [BOARD.x + BOARD.w, BOARD.y],
    [BOARD.x + BOARD.w, BOARD.y + BOARD.h],
    [BOARD.x, BOARD.y + BOARD.h],
  ].map(([x, y]) => shoot(x, y));

/** A patch of floor from near the camera to well behind the board. */
export const PATCH: [number, number][] = [
  [-900, 1100],
  [900, 1100],
  [1400, 4200],
  [-1400, 4200],
];
export const patchCorners = (): P[] => PATCH.map(([x, y]) => shoot(x, y));
