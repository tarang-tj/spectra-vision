/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// From the box in plane mm to lines in the picture: its eight corners, its
// edges and faces, and each edge cut back to the part in front of the camera.
// Pure: the drawing itself is in draw.ts.
import { projectPoint, type Camera } from "../../../measure/camera";
import { invert3 } from "../../../measure/vec";
import type { ExtensionEnv } from "../extension-types";
import type { BoxState } from "./box-state";
import { footprintCorners } from "./geometry";

export type P2 = { x: number; y: number };
export type V3 = readonly [number, number, number];
/** A point in plane mm (z up) to a flat picture point, or null when it is at
 * or beyond the horizon, behind the camera, or absurdly far off the picture. */
export type Projector = (x: number, y: number, z: number) => P2 | null;

/** Beyond this many pixels a point is as good as at the horizon. */
const FAR_PX = 1e5;
const sane = (p: P2 | null): P2 | null =>
  p && Math.abs(p.x) < FAR_PX && Math.abs(p.y) < FAR_PX ? p : null;

/** How the box can be drawn on this picture. `full` is false when the focal
 * length is not pinned down: only the floor (z = 0) is drawn then. */
export function projectorOf(
  env: Pick<ExtensionEnv, "d" | "camera">,
): { project: Projector; full: boolean; camera: Camera | null } | null {
  const sheet = env.d.sheet,
    cam = env.camera;
  if (!sheet) return null;
  if (cam?.focalResolved)
    return {
      project: (x, y, z) => sane(projectPoint(cam, x, y, z)),
      full: true,
      camera: cam,
    };
  // The plane map alone: exact on the floor whatever the focal length is.
  const g = invert3(sheet.h);
  if (!g) return null;
  const w = (x: number, y: number) => g[6] * x + g[7] * y + g[8],
    mid = sheet.plane.reduce(
      (t, p) => ({ x: t.x + p.x / 4, y: t.y + p.y / 4 }),
      { x: 0, y: 0 },
    ),
    // The reference is in front of the camera; so is whatever shares its sign.
    sign = Math.sign(w(mid.x, mid.y)) || 1;
  return {
    project: (x, y) => {
      const k = w(x, y);
      if (!(k * sign > 1e-9 * Math.abs(w(mid.x, mid.y)))) return null;
      return sane({
        x: (g[0] * x + g[1] * y + g[2]) / k,
        y: (g[3] * x + g[4] * y + g[5]) / k,
      });
    },
    full: false,
    camera: null,
  };
}

export type Solid = {
  /** Bottom corners 0 to 3 (the footprint, in order), top corners 4 to 7. */
  corners: V3[];
  /** Corner index pairs: four bottom edges, four top edges, four uprights. */
  edges: [number, number][];
  /** Corner indices round each face: bottom, top, then the four sides. */
  faces: number[][];
};

export function solidOf(box: BoxState & { at: P2 }): Solid {
  const foot = footprintCorners({ ...box, ...box.at }),
    corners: V3[] = [
      ...foot.map((p): V3 => [p.x, p.y, 0]),
      ...foot.map((p): V3 => [p.x, p.y, box.h]),
    ],
    ring = [0, 1, 2, 3],
    next = (i: number) => (i + 1) % 4;
  return {
    corners,
    edges: [
      ...ring.map((i): [number, number] => [i, next(i)]),
      ...ring.map((i): [number, number] => [i + 4, next(i) + 4]),
      ...ring.map((i): [number, number] => [i, i + 4]),
    ],
    faces: [
      ring,
      ring.map((i) => i + 4),
      ...ring.map((i) => [i, next(i), next(i) + 4, i + 4]),
    ],
  };
}

const centroid = (pts: readonly V3[]): V3 => {
  const n = pts.length;
  return [
    pts.reduce((t, p) => t + p[0], 0) / n,
    pts.reduce((t, p) => t + p[1], 0) / n,
    pts.reduce((t, p) => t + p[2], 0) / n,
  ];
};

/** Which faces are turned toward the camera. A box is convex, so a face is
 * seen from outside exactly when the camera is on its outer side. */
export function facesToward(solid: Solid, centre: V3): boolean[] {
  const mid = centroid(solid.corners);
  return solid.faces.map((face) => {
    const f = centroid(face.map((i) => solid.corners[i]));
    return (
      (f[0] - mid[0]) * (centre[0] - f[0]) +
        (f[1] - mid[1]) * (centre[1] - f[1]) +
        (f[2] - mid[2]) * (centre[2] - f[2]) >
      0
    );
  });
}

/** An edge is near when a face it borders is turned toward the camera. */
export const nearEdges = (solid: Solid, toward: readonly boolean[]) =>
  solid.edges.map(([a, b]) =>
    solid.faces.some(
      (face, f) => toward[f] && face.includes(a) && face.includes(b),
    ),
  );

/** The part of the segment a to b that can be drawn, as picture points. An
 * edge that crosses the horizon is cut there, not dropped. */
export function clipSegment(project: Projector, a: V3, b: V3): [P2, P2] | null {
  const at = (t: number) =>
      project(
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ),
    pa = at(0),
    pb = at(1);
  if (pa && pb) return [pa, pb];
  if (!pa && !pb) return null;
  // One end is drawable. Halve toward the other until the cut is found.
  let seen = pa ? 0 : 1,
    hidden = pa ? 1 : 0,
    last = (pa ?? pb)!;
  for (let i = 0; i < 40; i++) {
    const t = (seen + hidden) / 2,
      p = at(t);
    if (p) {
      seen = t;
      last = p;
    } else hidden = t;
  }
  return pa ? [pa, last] : [last, pb!];
}
