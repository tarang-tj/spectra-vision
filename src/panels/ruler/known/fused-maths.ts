/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The fused solve's parts: small 3x3 helpers, its residuals, and where each
// further rectangle starts. Pure.
import { invert3 as invertM3 } from "../../../measure/vec";
import { applyHomography, type Mat3, type Pt } from "../homography";

/** Centre and spread of a point set: coordinates become (v - c) / s. */
export type Norm = { cx: number; cy: number; s: number };

export function normOf(pts: Pt[]): Norm | null {
  const cx = pts.reduce((t, p) => t + p.x, 0) / pts.length,
    cy = pts.reduce((t, p) => t + p.y, 0) / pts.length,
    s = Math.sqrt(
      pts.reduce((t, p) => t + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) /
        (2 * pts.length),
    );
  return s > 0 && Number.isFinite(s) ? { cx, cy, s } : null;
}

/** Inverse of a plane map, or null when it is singular (measure/vec.ts,
 * without the finite check on the result, as before). */
export const invert3 = (m: Mat3): Mat3 | null =>
  invertM3(m, false) as Mat3 | null;

/** A plane point to the picture through `g`, the inverse of `h`. Null when
 * the point is at or beyond the horizon (`h` gives it no positive w). */
export function toImage(g: Mat3, h: Mat3, x: number, y: number): Pt | null {
  const w = g[6] * x + g[7] * y + g[8],
    ix = (g[0] * x + g[1] * y + g[2]) / w,
    iy = (g[3] * x + g[4] * y + g[5]) / w;
  if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
  return h[6] * ix + h[7] * iy + h[8] > 1e-6 ? { x: ix, y: iy } : null;
}

/** A map between scaled coordinates, as a map from pixels to millimetres. */
export function denormalize(h: Mat3, image: Norm, plane: Norm): Mat3 {
  // plane = D * h * S, with S scaling pixels down and D scaling mm back up.
  const s = [
      1 / image.s,
      0,
      -image.cx / image.s,
      0,
      1 / image.s,
      -image.cy / image.s,
      0,
      0,
      1,
    ],
    hs: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      hs.push(
        h[r * 3] * s[c] + h[r * 3 + 1] * s[3 + c] + h[r * 3 + 2] * s[6 + c],
      );
  return [
    plane.s * hs[0] + plane.cx * hs[6],
    plane.s * hs[1] + plane.cx * hs[7],
    plane.s * hs[2] + plane.cx * hs[8],
    plane.s * hs[3] + plane.cy * hs[6],
    plane.s * hs[4] + plane.cy * hs[7],
    plane.s * hs[5] + plane.cy * hs[8],
    hs[6],
    hs[7],
    hs[8],
  ];
}

/** Everything in scaled units: `s` is each tap's sd. */
export type Scaled = {
  first: { taps: Pt[]; plane: Pt[] };
  rects: { taps: Pt[]; plane: Pt[] }[];
  spans: { a: Pt; b: Pt; len: number; sd: number }[];
};

export const core = (p: number[]): Mat3 => [
  p[0],
  p[1],
  p[2],
  p[3],
  p[4],
  p[5],
  p[6],
  p[7],
  1,
];

/** Plane distance of a span, or null at the horizon. */
export function spanLen(h: Mat3, a: Pt, b: Pt): number | null {
  const pa = applyHomography(h, a),
    pb = applyHomography(h, b);
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : null;
}

/** Fills `r`; false when a point falls at or beyond the horizon. */
export function residuals(p: number[], sc: Scaled, r: Float64Array): boolean {
  const h = core(p),
    g = invert3(h);
  if (!g) return false;
  let at = 0;
  const corner = (x: number, y: number, t: Pt) => {
    const q = toImage(g, h, x, y);
    if (!q) return false;
    r[at++] = (q.x - t.x) / (t.s as number);
    r[at++] = (q.y - t.y) / (t.s as number);
    return true;
  };
  for (let k = 0; k < 4; k++)
    if (!corner(sc.first.plane[k].x, sc.first.plane[k].y, sc.first.taps[k]))
      return false;
  for (let j = 0; j < sc.rects.length; j++) {
    const rect = sc.rects[j],
      tx = p[8 + 3 * j],
      ty = p[9 + 3 * j],
      cos = Math.cos(p[10 + 3 * j]),
      sin = Math.sin(p[10 + 3 * j]);
    for (let k = 0; k < 4; k++) {
      const c = rect.plane[k];
      if (
        !corner(
          tx + c.x * cos - c.y * sin,
          ty + c.x * sin + c.y * cos,
          rect.taps[k],
        )
      )
        return false;
    }
  }
  for (const s of sc.spans) {
    const d = spanLen(h, s.a, s.b);
    if (d === null) return false;
    r[at++] = (d - s.len) / s.sd;
  }
  return true;
}

/** Each further rectangle laid where the map `h` sees it (best rigid fit). */
export function poses(h: Mat3, rects: Scaled["rects"]): number[] | null {
  const out: number[] = [];
  for (const rect of rects) {
    const q: Pt[] = [];
    for (const t of rect.taps) {
      const on = applyHomography(h, t);
      if (!on) return null;
      q.push(on);
    }
    const mean = (pts: Pt[], k: "x" | "y") =>
        pts.reduce((s, v) => s + v[k], 0) / pts.length,
      cx = mean(rect.plane, "x"),
      cy = mean(rect.plane, "y"),
      qx = mean(q, "x"),
      qy = mean(q, "y");
    let dot = 0,
      cross = 0;
    rect.plane.forEach((c, k) => {
      const ax = c.x - cx,
        ay = c.y - cy,
        bx = q[k].x - qx,
        by = q[k].y - qy;
      dot += ax * bx + ay * by;
      cross += ax * by - ay * bx;
    });
    const th = Math.atan2(cross, dot);
    out.push(
      qx - (cx * Math.cos(th) - cy * Math.sin(th)),
      qy - (cx * Math.sin(th) + cy * Math.cos(th)),
      th,
    );
  }
  return out;
}
