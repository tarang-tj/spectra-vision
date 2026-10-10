/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A synthetic floor photo for the Box tool tests, drawn from a real pinhole
// camera so that points above the floor have a true place in the picture.
// The truth is exact and uses none of the code under test: the projection is
// written out by hand here.
//
// Floor coordinates (mm): x to the right, y away from the camera, z up.

export type P = { x: number; y: number };
export const IMAGE = { w: 1200, h: 900 };
/** Focal length in pixels; the optical axis is through the picture's middle. */
export const F = 1000;
/** Where the camera stands, and how far it is tilted down from level. */
export const EYE = { x: 1050, y: -1200, z: 1900 };
export const TILT = (40 * Math.PI) / 180;
const SIN = Math.sin(TILT),
  COS = Math.cos(TILT);

/** The true picture position of a point `z` mm above floor position (x, y). */
export function shoot(x: number, y: number, z = 0): P {
  const dx = x - EYE.x,
    dy = y - EYE.y,
    dz = z - EYE.z,
    right = dx,
    down = -SIN * dy - COS * dz,
    forward = COS * dy - SIN * dz;
  return {
    x: IMAGE.w / 2 + (F * right) / forward,
    y: IMAGE.h / 2 + (F * down) / forward,
  };
}

const ROW2 = [0, COS, -COS * EYE.y + SIN * EYE.z];
/** Floor millimetres to picture pixels, row-major: the same camera at z = 0. */
export const H = [
  F + (IMAGE.w / 2) * ROW2[0],
  (IMAGE.w / 2) * ROW2[1],
  -F * EYE.x + (IMAGE.w / 2) * ROW2[2],
  (IMAGE.h / 2) * ROW2[0],
  -F * SIN + (IMAGE.h / 2) * ROW2[1],
  F * (SIN * EYE.y + COS * EYE.z) + (IMAGE.h / 2) * ROW2[2],
  ...ROW2,
];

/** The reference: a 1000 x 700 mm board on the floor (a custom reference). */
export const SHEET = { x: 300, y: 400, w: 1000, h: 700 };
export const sheetCorners = (): P[] =>
  [
    [SHEET.x, SHEET.y],
    [SHEET.x + SHEET.w, SHEET.y],
    [SHEET.x + SHEET.w, SHEET.y + SHEET.h],
    [SHEET.x, SHEET.y + SHEET.h],
  ].map(([x, y]) => shoot(x, y));

/** An alcove `width` mm wide and 1000 mm deep, its sides square to the board,
 * as floor corners in order. Its left wall is at x = 0. */
export const ALCOVE_DEPTH = 1000;
export const alcove = (width: number): P[] => [
  { x: 0, y: 1500 },
  { x: width, y: 1500 },
  { x: width, y: 1500 + ALCOVE_DEPTH },
  { x: 0, y: 1500 + ALCOVE_DEPTH },
];
export const alcoveCentre = (width: number): P => ({
  x: width / 2,
  y: 1500 + ALCOVE_DEPTH / 2,
});

/** Floor coordinates to the Ruler's plane coordinates for this picture. The
 * Ruler puts its origin at the board corner nearest the picture's top left
 * (the far left one) and runs x along the far edge and y toward the camera. */
export const toRuler = (p: P): P => ({
  x: p.x - SHEET.x,
  y: SHEET.y + SHEET.h - p.y,
});
