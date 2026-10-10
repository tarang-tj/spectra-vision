/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Plane geometry for the Ruler, in source pixels (never normalized units, so
// the aspect ratio is right). Pure: no DOM, no clock, no randomness.
import type { Fused } from "./fused-trials";

/** `s` is the tap uncertainty (one sd, source pixels) the point was placed
 * with; it rides along so the error bar does not depend on later resizing. */
export type Pt = { x: number; y: number; s?: number };
/** Row-major 3x3 matrix. */
export type Mat3 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** Solve A x = b by Gaussian elimination with partial pivoting. A is n x n
 * (row arrays), b has n entries. Null when the system is singular. */
export function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length,
    m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r][col]) > Math.abs(m[best][col])) best = r;
    if (Math.abs(m[best][col]) < 1e-12) return null;
    [m[col], m[best]] = [m[best], m[col]];
    for (let r = col + 1; r < n; r++) {
      const k = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= k * m[col][c];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let sum = m[r][n];
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c];
    x[r] = sum / m[r][r];
  }
  return x;
}

const mul = (p: Mat3, q: Mat3): Mat3 => {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out.push(
        p[r * 3] * q[c] + p[r * 3 + 1] * q[3 + c] + p[r * 3 + 2] * q[6 + c],
      );
  return out as unknown as Mat3;
};

/** The homography taking four image points to four plane points, by the
 * direct linear solve (h33 = 1). Both point sets are centred and scaled first,
 * which keeps the 8x8 system well conditioned for pixel-sized inputs. Null
 * when the four points do not define a projective map. */
export function solveHomography(src: Pt[], dst: Pt[]): Mat3 | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const norm = (pts: Pt[]) => {
    const cx = pts.reduce((s, p) => s + p.x, 0) / 4,
      cy = pts.reduce((s, p) => s + p.y, 0) / 4,
      rms = Math.sqrt(
        pts.reduce((s, p) => s + (p.x - cx) ** 2 + (p.y - cy) ** 2, 0) / 8,
      );
    return { cx, cy, s: rms };
  };
  const ns = norm(src),
    nd = norm(dst);
  if (!(ns.s > 0) || !(nd.s > 0)) return null;
  const a: number[][] = [],
    b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const x = (src[i].x - ns.cx) / ns.s,
      y = (src[i].y - ns.cy) / ns.s,
      u = (dst[i].x - nd.cx) / nd.s,
      v = (dst[i].y - nd.cy) / nd.s;
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const h = solveLinear(a, b);
  if (!h) return null;
  const core: Mat3 = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  // Undo the normalization: plane = Td^-1 * core * Ts.
  const ts: Mat3 = [
      1 / ns.s,
      0,
      -ns.cx / ns.s,
      0,
      1 / ns.s,
      -ns.cy / ns.s,
      0,
      0,
      1,
    ],
    tdInv: Mat3 = [nd.s, 0, nd.cx, 0, nd.s, nd.cy, 0, 0, 1];
  const out = mul(tdInv, mul(core, ts)),
    // Scale so w is exactly 1 at the centroid of the reference. Points with
    // w <= 0 then lie at or beyond the horizon of the plane.
    wc =
      out[6] * (src.reduce((t, q) => t + q.x, 0) / 4) +
      out[7] * (src.reduce((t, q) => t + q.y, 0) / 4) +
      out[8];
  if (!Number.isFinite(wc) || Math.abs(wc) < 1e-12) return null;
  const norm1 = out.map((v) => v / wc) as unknown as Mat3;
  return norm1.every(Number.isFinite) ? norm1 : null;
}

/** Map a point through a homography from `solveHomography` (w is 1 at the
 * reference centroid); null at or beyond the horizon, where w is not positive. */
export function applyHomography(h: Mat3, p: Pt): Pt | null {
  const w = h[6] * p.x + h[7] * p.y + h[8];
  if (!Number.isFinite(w) || w < 1e-6) return null;
  return {
    x: (h[0] * p.x + h[1] * p.y + h[2]) / w,
    y: (h[3] * p.x + h[4] * p.y + h[5]) / w,
  };
}

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** Four taps in any order to one consistent winding: clockwise on screen
 * (image y points down), starting at the corner nearest the top left. The
 * result depends only on the point values, never on the order they were
 * tapped. */
export function orderCorners(points: Pt[]): Pt[] {
  if (points.length !== 4) return [...points];
  const cx = points.reduce((s, p) => s + p.x, 0) / 4,
    cy = points.reduce((s, p) => s + p.y, 0) / 4,
    byAngle = [...points].sort(
      (p, q) =>
        Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx) ||
        p.x - q.x ||
        p.y - q.y,
    );
  let first = 0;
  for (let i = 1; i < 4; i++) {
    const a = byAngle[i],
      b = byAngle[first];
    if (
      a.x + a.y < b.x + b.y - 1e-9 ||
      (Math.abs(a.x + a.y - b.x - b.y) <= 1e-9 &&
        (a.y < b.y || (a.y === b.y && a.x < b.x)))
    )
      first = i;
  }
  return [0, 1, 2, 3].map((i) => byAngle[(first + i) % 4]);
}

export type Degenerate =
  | "needs four corners"
  | "corners overlap or are nearly in a line"
  | "corners do not form a convex four-sided shape"
  | "the reference is too small to measure from";

/** Why four ordered corners cannot define a plane, or null when they can.
 * Rejects overlapping taps, three nearly collinear corners (turn under about
 * 3 degrees), a non-convex shape and a tiny area. */
export function degenerateReason(
  ordered: Pt[],
  minArea = 100,
): Degenerate | null {
  if (ordered.length !== 4) return "needs four corners";
  let sign = 0,
    area2 = 0;
  for (let i = 0; i < 4; i++) {
    const a = ordered[i],
      b = ordered[(i + 1) % 4],
      c = ordered[(i + 2) % 4],
      ab = dist(a, b),
      bc = dist(b, c);
    if (ab < 2 || bc < 2) return "corners overlap or are nearly in a line";
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) / (ab * bc) < 0.05)
      return "corners overlap or are nearly in a line";
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign)
      return "corners do not form a convex four-sided shape";
    area2 += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area2) / 2 < minArea
    ? "the reference is too small to measure from"
    : null;
}

/** Area of the ordered quadrilateral in square pixels. */
export function quadArea(ordered: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < ordered.length; i++) {
    const a = ordered[i],
      b = ordered[(i + 1) % ordered.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

export type Sheet = {
  ordered: Pt[];
  /** True when corner 0 to corner 1 is the reference's long side. */
  firstIsLong: boolean;
  /** Plane corners (mm), matching `ordered`. */
  plane: Pt[];
  h: Mat3;
  /** The corners as tapped (before any lens correction), in `ordered` order.
   * The error bar perturbs these; `ordered` holds what the solve used. */
  raw?: Pt[];
  /** Set when further references or known spans were fused into `h`. The
   * error bar then repeats that whole solve instead of the four-point one. */
  fused?: Fused;
};

/** Assign the reference's long side by the longer-looking pair of opposite
 * sides in the image (`swap` flips it), then solve image pixels to plane mm.
 * `long` and `short` are the reference's sides in mm. */
export function solveSheet(
  ordered: Pt[],
  long: number,
  short: number,
  swap: boolean,
  /** Fixes which side is long (during a drag), overriding the guess. */
  forceFirstIsLong?: boolean,
): Sheet | null {
  if (ordered.length !== 4 || degenerateReason(ordered)) return null;
  const first =
      (dist(ordered[0], ordered[1]) + dist(ordered[3], ordered[2])) / 2,
    second = (dist(ordered[1], ordered[2]) + dist(ordered[0], ordered[3])) / 2,
    firstIsLong = forceFirstIsLong ?? first >= second !== swap,
    w = firstIsLong ? long : short,
    d = firstIsLong ? short : long,
    plane = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: w, y: d },
      { x: 0, y: d },
    ],
    h = solveHomography(ordered, plane);
  return h ? { ordered, firstIsLong, plane, h } : null;
}

/** Distance in plane millimetres between two image points, or null. */
export function planeDistance(h: Mat3, a: Pt, b: Pt): number | null {
  const pa = applyHomography(h, a),
    pb = applyHomography(h, b);
  return pa && pb ? dist(pa, pb) : null;
}
