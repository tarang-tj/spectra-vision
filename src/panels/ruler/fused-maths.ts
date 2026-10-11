/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Small 3x3 helpers for the fused solve. Pure.
import type { Mat3, Pt } from "./homography";

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

export function invert3(m: Mat3): Mat3 | null {
  const a = m[4] * m[8] - m[5] * m[7],
    b = m[5] * m[6] - m[3] * m[8],
    c = m[3] * m[7] - m[4] * m[6],
    det = m[0] * a + m[1] * b + m[2] * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-300) return null;
  return [
    a / det,
    (m[2] * m[7] - m[1] * m[8]) / det,
    (m[1] * m[5] - m[2] * m[4]) / det,
    b / det,
    (m[0] * m[8] - m[2] * m[6]) / det,
    (m[2] * m[3] - m[0] * m[5]) / det,
    c / det,
    (m[1] * m[6] - m[0] * m[7]) / det,
    (m[0] * m[4] - m[1] * m[3]) / det,
  ];
}

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
