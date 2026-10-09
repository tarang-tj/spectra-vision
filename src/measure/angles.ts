/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Joint and head angles, in degrees. Pure: points in, numbers out. A
// degenerate input (a zero-length limb, a malformed matrix) gives NaN or null,
// never a made-up angle.
import type { Point } from "../vision/types";

const DEG = 180 / Math.PI;

/** The angle at `b` between the rays to `a` and to `c`, in 0..180. */
function between(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): number {
  const ux = a[0] - b[0],
    uy = a[1] - b[1],
    uz = a[2] - b[2],
    vx = c[0] - b[0],
    vy = c[1] - b[1],
    vz = c[2] - b[2];
  const lengths = Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz);
  if (!(lengths > 0)) return NaN;
  const cosine = (ux * vx + uy * vy + uz * vz) / lengths;
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * DEG;
}

/** Joint angle at `b` from image-plane x and y. Image-normalized x spans the
 * image width and y its height, so pass `aspect` (width / height) to put both
 * on the same scale; leave it at 1 for pixel or metre coordinates. */
export function jointAngle2D(a: Point, b: Point, c: Point, aspect = 1): number {
  return between(
    [a.x * aspect, a.y, 0],
    [b.x * aspect, b.y, 0],
    [c.x * aspect, c.y, 0],
  );
}

/** Joint angle at `b` in 3D. NaN unless all three points have a z. Use world
 * landmarks (metres) for it: the z of image landmarks is a relative depth on a
 * different scale from x and y. */
export function jointAngle3D(a: Point, b: Point, c: Point): number {
  if (a.z === undefined || b.z === undefined || c.z === undefined) return NaN;
  return between([a.x, a.y, a.z], [b.x, b.y, b.z], [c.x, c.y, c.z]);
}

/** The shortest signed difference `a - b` between two angles, in (-180, 180]. */
export function angleDifference(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
}

export type HeadPose = { yaw: number; pitch: number; roll: number };

/** Head rotation in degrees from the 4x4 facial transformation matrix
 * (column-major, x right, y up, z toward the camera). Yaw is positive when the
 * face turns toward the right of the image, pitch when it tilts up, roll when
 * it leans counter-clockwise as seen in the image. Null for a malformed matrix. */
export function headPose(
  matrix: readonly number[] | undefined,
): HeadPose | null {
  if (!matrix || matrix.length < 16) return null;
  // The upper-left 3x3 may carry a uniform scale: divide it out.
  const scale = Math.hypot(matrix[0], matrix[1], matrix[2]);
  if (!Number.isFinite(scale) || scale < 1e-6) return null;
  // Where the face's forward (z) axis points, and how its x axis is rolled.
  const fx = matrix[8] / scale,
    fy = matrix[9] / scale,
    fz = matrix[10] / scale;
  return {
    yaw: Math.atan2(fx, fz) * DEG,
    pitch: Math.asin(Math.min(1, Math.max(-1, fy))) * DEG,
    roll: Math.atan2(matrix[1], matrix[5]) * DEG,
  };
}

/** The inverse of `headPose`: a column-major 4x4 matrix (no translation) for a
 * head turned by these angles. For tests and for synthetic sequences. */
export function headMatrix(yaw: number, pitch: number, roll: number): number[] {
  const y = yaw / DEG,
    p = pitch / DEG,
    r = roll / DEG;
  const [cy, sy, cp, sp, cr, sr] = [
    Math.cos(y),
    Math.sin(y),
    Math.cos(p),
    Math.sin(p),
    Math.cos(r),
    Math.sin(r),
  ];
  // R = Ry(yaw) * Rx(-pitch) * Rz(roll), written out row by row.
  const R = [
    [cy * cr - sy * sp * sr, -cy * sr - sy * sp * cr, sy * cp],
    [cp * sr, cp * cr, sp],
    [-sy * cr - cy * sp * sr, sy * sr - cy * sp * cr, cy * cp],
  ];
  const m = new Array<number>(16).fill(0);
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) m[col * 4 + row] = R[row][col];
  m[15] = 1;
  return m;
}
