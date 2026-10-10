/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A camera recovered from one picture of a flat reference of known size: the
// focal length, where the camera stood and which way is up. With it a point
// above the surface can be drawn, and a height above a known floor point can
// be read. Pure: no DOM, no clock, no randomness.
//
// Assumptions, all stated to the user by whoever shows a number from here:
// square pixels, the optical axis through the middle of the picture, and no
// lens distortion beyond what the caller removed first.
import {
  projectPose,
  refinePose,
  type Frame,
  type P2,
  type Plumb,
  type Pose,
  type Seen,
} from "./camera-fit";
import {
  add3,
  column,
  cross3,
  dot3,
  fromColumns,
  invert3,
  length3,
  mulVec,
  scale3,
  transpose,
  unit3,
  type M3,
  type V3,
} from "./vec";

export type { P2, Plumb, Seen } from "./camera-fit";

export type CameraInput = {
  /** Picture pixels to plane mm (the Ruler's `sheet.h`). */
  h: M3;
  /** Source size in pixels. */
  width: number;
  height: number;
  /** The reference's corners: plane mm and where each was tapped. At least four. */
  seen: readonly Seen[];
  /** Edges that are plumb in reality (a door frame, a wall corner). Each one
   * steadies the focal length; none are required. */
  plumbs?: readonly Plumb[];
  /** Start from this camera only (a jittered trial next to a solved one). */
  near?: Camera;
};

export type Camera = {
  /** Focal length in source pixels. */
  f: number;
  cx: number;
  cy: number;
  /** Plane mm to picture pixels, exactly as the caller's plane map has it. */
  g: M3;
  /** Added to `g * [x, y, 1]` once per mm of height, before the divide. */
  lift: V3;
  /** World (x, y in the plane, z up, mm) to camera coordinates (x right,
   * y down, z forward, mm): `r * p + t`. */
  r: M3;
  t: V3;
  /** Where the camera stood, in world mm. `centre[2]` is its height. */
  centre: V3;
  /** +1 when plane x, plane y and up form a right-handed set, -1 when they
   * form a left-handed one (a 3D export must flip one axis then). */
  handed: 1 | -1;
  /** Root mean square of the fit's residuals, source pixels. */
  rms: number;
  /** False when the picture does not pin the focal length down (the camera
   * faces the surface squarely and no plumb edge was given): heights are not
   * to be trusted then, positions on the surface still are. */
  focalResolved: boolean;
};

/** Focal lengths tried, as multiples of the picture's longer side. Phone main
 * cameras sit near 0.7 to 0.9, wide ones near 0.4, zoomed ones above 2. */
const STARTS = [0.45, 0.8, 1.3, 2.2, 3.6];
const F_MIN = 0.2;
const F_MAX = 8;

/** A pose for a given focal length, straight from the plane map. */
function poseFor(g: M3, f: number, cx: number, cy: number): Pose | null {
  const back = (v: V3): V3 => [
      (v[0] - cx * v[2]) / f,
      (v[1] - cy * v[2]) / f,
      v[2],
    ],
    a1 = back(column(g, 0)),
    a2 = back(column(g, 1)),
    a3 = back(column(g, 2)),
    n = (length3(a1) + length3(a2)) / 2;
  if (!(n > 1e-300)) return null;
  // The plane is in front of the camera.
  const s = (a3[2] < 0 ? -1 : 1) / n,
    r1 = unit3(scale3(a1, s)),
    raw2 = scale3(a2, s);
  if (!r1) return null;
  const r2 = unit3(add3(raw2, scale3(r1, -dot3(raw2, r1))));
  if (!r2) return null;
  return { f, r: fromColumns(r1, r2, cross3(r1, r2)), t: scale3(a3, s) };
}

/** Focal lengths the plane map itself suggests: the two classic constraints
 * (the plane's axes are perpendicular and equally long). */
function closedForm(g: M3, cx: number, cy: number): number[] {
  const c = (v: V3): V3 => [v[0] - cx * v[2], v[1] - cy * v[2], v[2]],
    p = c(column(g, 0)),
    q = c(column(g, 1)),
    out: number[] = [];
  const push = (a: number, b: number) => {
    const u = -b / a;
    if (Number.isFinite(u) && u > 0) out.push(1 / Math.sqrt(u));
  };
  push(p[0] * q[0] + p[1] * q[1], p[2] * q[2]);
  push(
    p[0] * p[0] + p[1] * p[1] - q[0] * q[0] - q[1] * q[1],
    p[2] * p[2] - q[2] * q[2],
  );
  return out;
}

/** Fit a camera, or null when the plane map cannot be inverted or no start
 * gives a camera in front of the surface. */
export function fitCamera(input: CameraInput): Camera | null {
  const { h, width, height, seen } = input,
    plumbs = input.plumbs ?? [],
    g = invert3(h);
  if (!g || seen.length < 4 || !(width > 0) || !(height > 0)) return null;
  const side = Math.max(width, height),
    frame: Frame = {
      cx: width / 2,
      cy: height / 2,
      fMin: F_MIN * side,
      fMax: F_MAX * side,
    },
    starts: Pose[] = [];
  if (input.near)
    starts.push({ f: input.near.f, r: input.near.r, t: input.near.t });
  else
    for (const f of [
      ...closedForm(g, frame.cx, frame.cy),
      ...STARTS.map((k) => k * side),
    ]) {
      const clamped = Math.min(frame.fMax, Math.max(frame.fMin, f)),
        pose = poseFor(g, clamped, frame.cx, frame.cy);
      if (pose) starts.push(pose);
    }
  let best: ReturnType<typeof refinePose> | null = null;
  for (const start of starts) {
    const fit = refinePose(start, frame, seen, plumbs);
    if (Number.isFinite(fit.cost) && (!best || fit.cost < best.cost))
      best = fit;
  }
  if (!best) return null;
  return finish(best.pose, frame, g, best.cost, best.count, plumbs.length);
}

function finish(
  pose: Pose,
  frame: Frame,
  g: M3,
  cost: number,
  count: number,
  plumbCount: number,
): Camera | null {
  // World z from the fit is plane x cross plane y. Up is whichever of the two
  // normals the camera is on the side of.
  const fitCentre = scale3(mulVec(transpose(pose.r), pose.t), -1),
    handed: 1 | -1 = fitCentre[2] >= 0 ? 1 : -1,
    r1 = column(pose.r, 0),
    r2 = column(pose.r, 1),
    up = scale3(column(pose.r, 2), handed),
    k = (v: V3): V3 => [
      pose.f * v[0] + frame.cx * v[2],
      pose.f * v[1] + frame.cy * v[2],
      v[2],
    ],
    // The fitted camera's own plane map, to find the caller's scale and sign.
    m = [k(r1), k(r2), k(pose.t)];
  let num = 0,
    den = 0;
  m.forEach((col, c) =>
    col.forEach((v, row) => {
      num += g[row * 3 + c] * v;
      den += v * v;
    }),
  );
  if (!(den > 0) || !Number.isFinite(num) || num === 0) return null;
  const lift = scale3(k(up), num / den),
    edge = pose.f <= frame.fMin * 1.001 || pose.f >= frame.fMax * 0.999;
  return {
    f: pose.f,
    cx: frame.cx,
    cy: frame.cy,
    g,
    lift,
    r: fromColumns(r1, r2, up),
    t: pose.t,
    centre: [fitCentre[0], fitCentre[1], Math.abs(fitCentre[2])],
    handed,
    rms: Math.sqrt(cost / Math.max(1, count)),
    focalResolved: !edge && (plumbCount > 0 || tilted(pose)),
  };
}

/** The focal length shows only through perspective. A camera within about 8
 * degrees of square-on to the surface gives almost none. */
function tilted(pose: Pose): boolean {
  const axis = Math.abs(column(pose.r, 2)[2]);
  return axis < Math.cos((8 * Math.PI) / 180);
}

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

/** A world point (mm) in camera coordinates (x right, y down, z forward). */
export function toCamera(cam: Camera, x: number, y: number, z = 0): V3 {
  return add3(mulVec(cam.r, [x, y, z]), cam.t);
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
