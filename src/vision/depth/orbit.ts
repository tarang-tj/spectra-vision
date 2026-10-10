/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The 3D view's one matrix. Points are in a camera's frame (x right, y down,
// z forward). The view turns the points about a pivot and looks at them from
// a fixed eye, so with no turn it is the eye's own picture. Pure.

export type Orbit = {
  /** Where the viewer stands and the point the scene turns about. */
  eye: readonly [number, number, number];
  pivot: readonly [number, number, number];
  /** Radius of a ball around the pivot that holds every point. */
  radius: number;
  /** Turn to the side and up or down, in degrees. */
  yaw: number;
  pitch: number;
  /** Vertical field of view in radians, and width / height of the view. */
  fovY: number;
  aspect: number;
};

export const YAW_LIMIT = 85;
export const PITCH_LIMIT = 60;

/** Column-major 4 x 4 for WebGL: clip = matrix * [x, y, z, 1]. */
export function orbitMatrix(o: Orbit): Float32Array {
  const yaw = (o.yaw * Math.PI) / 180,
    pitch = (o.pitch * Math.PI) / 180,
    cy = Math.cos(yaw),
    sy = Math.sin(yaw),
    cp = Math.cos(pitch),
    sp = Math.sin(pitch),
    // Rows of Rx(pitch) * Ry(yaw).
    r = [
      [cy, 0, sy],
      [sp * sy, cp, -sp * cy],
      [-cp * sy, sp, cp * cy],
    ],
    // q = R * (p - pivot) + pivot - eye, written as R * p + t.
    t = r.map(
      (row, k) =>
        o.pivot[k] -
        o.eye[k] -
        (row[0] * o.pivot[0] + row[1] * o.pivot[1] + row[2] * o.pivot[2]),
    ),
    reach = Math.hypot(
      o.pivot[0] - o.eye[0],
      o.pivot[1] - o.eye[1],
      o.pivot[2] - o.eye[2],
    ),
    far = reach + 2 * o.radius,
    near = Math.max(far * 1e-3, (reach - 2 * o.radius) * 0.5),
    f = 1 / Math.tan(o.fovY / 2),
    // Camera frame to GL eye space flips y and z; then a perspective divide
    // by the forward distance.
    sx = f / o.aspect,
    sY = -f,
    a = (far + near) / (far - near),
    b = (-2 * far * near) / (far - near),
    m = new Float32Array(16);
  for (let c = 0; c < 3; c++) {
    m[c * 4] = sx * r[0][c];
    m[c * 4 + 1] = sY * r[1][c];
    m[c * 4 + 2] = a * r[2][c];
    m[c * 4 + 3] = r[2][c];
  }
  m[12] = sx * t[0];
  m[13] = sY * t[1];
  m[14] = a * t[2] + b;
  m[15] = t[2];
  return m;
}

/** Where a point lands in the view: x and y in -1..1 (y up) when it is in
 * sight, and `w`, its distance in front of the eye. For tests. */
export function viewPoint(
  m: Float32Array,
  p: readonly [number, number, number],
): { x: number; y: number; w: number } {
  const at = (row: number) =>
      m[row] * p[0] + m[4 + row] * p[1] + m[8 + row] * p[2] + m[12 + row],
    w = at(3);
  return { x: at(0) / w, y: at(1) / w, w };
}
