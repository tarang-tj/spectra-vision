/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Least-squares fit of a pinhole camera to what was tapped on one picture.
// Every residual is a distance in source pixels, so points and plumb lines
// weigh in by how well a tap can place them and nothing needs a hand-set
// weight. Pure: no DOM, no clock, no randomness.
import {
  column,
  mulMat,
  mulVec,
  rodrigues,
  solveLinear,
  type M3,
  type V3,
} from "./vec";

export type P2 = { x: number; y: number };
/** A plane point (mm) and where it was seen (source pixels). */
export type Seen = { plane: P2; image: P2 };
/** Two picture points on an edge that is plumb in reality. */
export type Plumb = { a: P2; b: P2 };

/** World to camera: `r` times a world point plus `t`. World x and y lie in the
 * reference's plane (mm); world z is their cross product. The camera looks
 * along its own +z, with x right and y down as in the picture. */
export type Pose = { f: number; r: M3; t: V3 };
export type Frame = { cx: number; cy: number; fMin: number; fMax: number };

/** Where a world point lands in the picture, or null behind the camera. */
export function projectPose(
  p: Pose,
  frame: Frame,
  x: number,
  y: number,
  z: number,
): P2 | null {
  const c = mulVec(p.r, [x, y, z]),
    w = c[2] + p.t[2];
  if (!(w > 1e-9)) return null;
  return {
    x: (p.f * (c[0] + p.t[0])) / w + frame.cx,
    y: (p.f * (c[1] + p.t[1])) / w + frame.cy,
  };
}

/** Far from any picture: a point that fell behind the camera in a trial. */
const BEHIND = 1e6;

function residuals(
  p: Pose,
  frame: Frame,
  seen: readonly Seen[],
  plumbs: readonly Plumb[],
): number[] {
  const out: number[] = [];
  for (const s of seen) {
    const q = projectPose(p, frame, s.plane.x, s.plane.y, 0);
    if (!q) out.push(BEHIND, BEHIND);
    else out.push(q.x - s.image.x, q.y - s.image.y);
  }
  if (plumbs.length) {
    // Vanishing point of the plumb direction, homogeneous picture coordinates.
    const up = column(p.r, 2),
      vx = p.f * up[0] + frame.cx * up[2],
      vy = p.f * up[1] + frame.cy * up[2],
      vw = up[2];
    for (const { a, b } of plumbs) {
      // The line through `a` and the vanishing point; `b` should lie on it.
      const lx = a.y * vw - vy,
        ly = vx - a.x * vw,
        lw = a.x * vy - a.y * vx,
        n = Math.hypot(lx, ly);
      // Both ends carry tap noise, hence the root two.
      out.push(n > 1e-12 ? (lx * b.x + ly * b.y + lw) / n / Math.SQRT2 : 0);
    }
  }
  return out;
}

const sumSq = (v: number[]) => v.reduce((s, x) => s + x * x, 0);

/** Move a pose by seven small numbers: log focal length, a rotation vector
 * applied on the right, and a translation in units of the pose's distance. */
function step(p: Pose, frame: Frame, d: number[], reach: number): Pose {
  return {
    f: Math.min(frame.fMax, Math.max(frame.fMin, p.f * Math.exp(d[0]))),
    r: mulMat(p.r, rodrigues([d[1], d[2], d[3]])),
    t: [p.t[0] + d[4] * reach, p.t[1] + d[5] * reach, p.t[2] + d[6] * reach],
  };
}

export type Refined = { pose: Pose; cost: number; count: number };

/** Levenberg-Marquardt from `start`. `cost` is the sum of squared residuals
 * in pixels over `count` residuals. */
export function refinePose(
  start: Pose,
  frame: Frame,
  seen: readonly Seen[],
  plumbs: readonly Plumb[],
  iterations = 40,
): Refined {
  const reach = Math.max(1e-9, Math.hypot(start.t[0], start.t[1], start.t[2])),
    eps = 1e-6;
  let pose = start,
    r = residuals(pose, frame, seen, plumbs),
    cost = sumSq(r),
    mu = 1e-3;
  for (let it = 0; it < iterations; it++) {
    const cols: number[][] = [];
    for (let k = 0; k < 7; k++) {
      const d = new Array<number>(7).fill(0);
      d[k] = eps;
      const rk = residuals(step(pose, frame, d, reach), frame, seen, plumbs);
      cols.push(rk.map((v, i) => (v - r[i]) / eps));
    }
    const jtj = cols.map((ci) =>
        cols.map((cj) => ci.reduce((s, v, i) => s + v * cj[i], 0)),
      ),
      jtr = cols.map((ci) => ci.reduce((s, v, i) => s + v * r[i], 0));
    let better = false;
    for (let tries = 0; tries < 10 && !better; tries++) {
      const a = jtj.map((row, i) =>
          row.map((v, j) => (i === j ? v * (1 + mu) + 1e-12 : v)),
        ),
        d = solveLinear(
          a,
          jtr.map((v) => -v),
        );
      if (d) {
        const next = step(pose, frame, d, reach),
          rn = residuals(next, frame, seen, plumbs),
          cn = sumSq(rn);
        if (cn < cost) {
          const gain = cost - cn;
          pose = next;
          r = rn;
          cost = cn;
          mu = Math.max(mu / 3, 1e-9);
          better = true;
          if (gain < 1e-12 * (1 + cost)) return { pose, cost, count: r.length };
        }
      }
      if (!better) mu *= 4;
    }
    if (!better) break;
  }
  return { pose, cost, count: r.length };
}
