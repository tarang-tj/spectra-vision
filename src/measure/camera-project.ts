/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Using a fitted camera (camera.ts): where a point above the surface lands in
// the picture, the ray a picture point looks along, and the height of a plumb
// line. Pure: no DOM, no clock, no randomness.
import { toCamera, type Camera } from "./camera";
import { projectPose, type P2 } from "./camera-fit";
import { mulVec, transpose, unit3, type V3 } from "./vec";

/** Where the point `z` mm above plane position (x, y) lands in the picture,
 * or null at or beyond the horizon and behind the camera. On the surface
 * (z = 0) this is exactly the caller's own plane map. */
export function projectPoint(
  cam: Camera,
  x: number,
  y: number,
  z = 0,
): P2 | null {
  const { g, lift } = cam,
    w0 = g[6] * x + g[7] * y + g[8],
    w = w0 + z * lift[2];
  // The reference sits where w0 has the sign of g[8] scaled to 1 at its
  // centroid by the Ruler; a flipped sign is the far side of the horizon.
  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) return null;
  if (!inFront(cam, x, y, z)) return null;
  return {
    x: (g[0] * x + g[1] * y + g[2] + z * lift[0]) / w,
    y: (g[3] * x + g[4] * y + g[5] + z * lift[1]) / w,
  };
}

const inFront = (cam: Camera, x: number, y: number, z: number) =>
  toCamera(cam, x, y, z)[2] > 1e-6;

/** The ray a picture point looks along, in world mm: it starts at the
 * camera's centre and `dir` is a unit vector. */
export function pixelRay(cam: Camera, p: P2): { origin: V3; dir: V3 } {
  const inCam: V3 = [(p.x - cam.cx) / cam.f, (p.y - cam.cy) / cam.f, 1],
    dir = unit3(mulVec(transpose(cam.r), inCam)) ?? ([0, 0, 1] as V3);
  return { origin: cam.centre, dir };
}

export type Height = {
  /** Height above the surface, mm (negative below it). */
  z: number;
  /** How far the tapped point is from the plumb line through the base, in
   * source pixels. Large means the point is not above that base. */
  off: number;
};

/** The height at which the plumb line through plane position `base` passes
 * the picture point `top`. Null when the plumb line points at the camera (its
 * picture is a single point) or the base is not in view. */
export function heightAbove(cam: Camera, base: P2, top: P2): Height | null {
  const { g, lift } = cam,
    qx = g[0] * base.x + g[1] * base.y + g[2],
    qy = g[3] * base.x + g[4] * base.y + g[5],
    qw = g[6] * base.x + g[7] * base.y + g[8],
    a1 = lift[0] - top.x * lift[2],
    a2 = lift[1] - top.y * lift[2],
    b1 = top.x * qw - qx,
    b2 = top.y * qw - qy,
    den = a1 * a1 + a2 * a2;
  if (!(den > 1e-300) || !inFront(cam, base.x, base.y, 0)) return null;
  const z = (a1 * b1 + a2 * b2) / den,
    at = projectPoint(cam, base.x, base.y, z);
  if (!Number.isFinite(z) || !at) return null;
  return { z, off: Math.hypot(at.x - top.x, at.y - top.y) };
}

/** Field of view across the picture's width, degrees. */
export const horizontalFov = (cam: Camera): number =>
  (2 * Math.atan(cam.cx / cam.f) * 180) / Math.PI;

/** The fitted camera's own projection, for tests: where a world point lands
 * using only f, r and t (not the caller's plane map). */
export function projectByPose(
  cam: Camera,
  x: number,
  y: number,
  z = 0,
): P2 | null {
  return projectPose(
    { f: cam.f, r: cam.r, t: cam.t },
    { cx: cam.cx, cy: cam.cy, fMin: 0, fMax: Infinity },
    x,
    y,
    z,
  );
}
