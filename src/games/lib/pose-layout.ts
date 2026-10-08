/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Turns a set of joint angles back into a stick figure: for drawing Mirror's
// target outline and for building test poses. Pure: no DOM, canvas or audio.
import type { Point } from "../../vision/types";
import { LIMBS } from "./pose-logic";

// Stick-figure proportions, in shoulder widths.
const UPPER = [0.8, 0.8, 1.1, 1.1],
  LOWER = [0.75, 0.75, 1.05, 1.05],
  TORSO = 1.5,
  HIP_HALF = 0.32;
/** Figure point order from layoutPose: for each limb (left arm, right arm,
 * left leg, right leg) its root, middle and end. 12 points, 24 numbers. */
export const FIGURE_POINTS = 12;

/** Lay a target pose out as a stick figure: shoulders centred on (cx, cy),
 * `unit` is the shoulder width, y grows downward as on screen. The person
 * faces the viewer, so their left side is on the viewer's right. */
export function layoutPose(
  angles: ArrayLike<number>,
  cx: number,
  cy: number,
  unit: number,
  out: Float32Array,
) {
  for (let limb = 0; limb < 4; limb++) {
    const side = limb % 2 === 0 ? 1 : -1,
      leg = limb > 1,
      rx = cx + side * unit * (leg ? HIP_HALF : 0.5),
      ry = cy + (leg ? unit * TORSO : 0),
      a = angles[limb * 2],
      b = a + angles[limb * 2 + 1],
      // Direction of a segment bent by `a` from straight down (0, 1).
      mx = rx - Math.sin(a) * unit * UPPER[limb],
      my = ry + Math.cos(a) * unit * UPPER[limb],
      o = limb * 6;
    out[o] = rx;
    out[o + 1] = ry;
    out[o + 2] = mx;
    out[o + 3] = my;
    out[o + 4] = mx - Math.sin(b) * unit * LOWER[limb];
    out[o + 5] = my + Math.cos(b) * unit * LOWER[limb];
  }
  return out;
}

/** The same figure as pose-model landmarks in image coordinates (0..1), for
 * tests and the test hook. `unit` is the shoulder width as a share of the
 * image height. */
export function landmarksFromAngles(
  angles: ArrayLike<number>,
  cx: number,
  cy: number,
  unit: number,
  aspect: number,
): Point[] {
  const figure = layoutPose(
      angles,
      cx * aspect,
      cy,
      unit,
      new Float32Array(24),
    ),
    points: Point[] = Array.from({ length: 33 }, () => ({
      x: cx,
      y: cy - unit * 0.6,
      visibility: 1,
    }));
  LIMBS.forEach((limb, l) =>
    limb.forEach((index, part) => {
      points[index] = {
        x: figure[l * 6 + part * 2] / aspect,
        y: figure[l * 6 + part * 2 + 1],
        visibility: 1,
      };
    }),
  );
  return points;
}
