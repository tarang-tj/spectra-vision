/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One plane map from every known size in the picture, by least squares. Every
// residual is a miss divided by its own standard deviation, so nothing needs a
// hand-set weight:
//   - a rectangle corner: where the model puts it minus where it was tapped,
//     in pixels, over the tap uncertainty;
//   - a known span: its length on the plane minus the typed length, over the
//     tap uncertainty of both ends carried through the local scale (mm per
//     pixel along the span at each end) combined with the tape uncertainty.
// The unknowns are the eight numbers of the map and, for each further
// rectangle, where it lies on the surface (two offsets and a turn). The work
// is done in centred, scaled coordinates so the numbers are all of order one.
// Pure: no DOM, no randomness.
import {
  applyHomography,
  solveHomography,
  solveLinear,
  type Mat3,
  type Pt,
} from "./homography";
import {
  denormalize,
  invert3,
  normOf,
  toImage,
  type Norm,
} from "./fused-maths";

/** Four taps (flat pixels, each with its `s`) and the rectangle's own corners
 * in mm, in the same order. */
export type FuseRect = { taps: Pt[]; plane: Pt[] };
export type FuseSpan = { a: Pt; b: Pt; mm: number };
export type FuseInput = {
  first: FuseRect;
  rects: FuseRect[];
  spans: FuseSpan[];
  /** Tap sd (pixels) for a point that carries none. */
  sigmaPx: number;
  /** Tape sd (mm) on each typed length. */
  tapeSigmaMm: number;
};
export type FuseSolution = {
  /** Flat picture pixels to plane mm. */
  h: Mat3;
  /** Where the fused map puts the first reference's corners (flat pixels). */
  corners: Pt[];
  /** Root mean square residual per spare constraint, in standard deviations:
   * about 1 when the known sizes agree as well as tap error allows. */
  chi: number;
  iterations: number;
  /** The unknowns and the scaling they are in, to start a nearby solve. */
  start: FuseStart;
};
export type FuseStart = { params: number[]; image: Norm; plane: Norm };

/** Everything in scaled units: `s` is each tap's sd. */
type Scaled = {
  first: { taps: Pt[]; plane: Pt[] };
  rects: { taps: Pt[]; plane: Pt[] }[];
  spans: { a: Pt; b: Pt; len: number; sd: number }[];
};

const core = (p: number[]): Mat3 => [
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
function spanLen(h: Mat3, a: Pt, b: Pt): number | null {
  const pa = applyHomography(h, a),
    pb = applyHomography(h, b);
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : null;
}

/** One sd of a known span's length: both ends' tap sd through the local
 * scale, and the tape. Held fixed for the whole solve. */
function spanSd(h: Mat3, a: Pt, b: Pt, tape: number): number | null {
  let v = tape * tape;
  for (const [end, other] of [
    [a, b],
    [b, a],
  ]) {
    const e = (end.s as number) / 2;
    for (const [dx, dy] of [
      [e, 0],
      [0, e],
    ]) {
      const up = spanLen(h, { x: end.x + dx, y: end.y + dy }, other),
        down = spanLen(h, { x: end.x - dx, y: end.y - dy }, other);
      if (up === null || down === null) return null;
      v += (up - down) ** 2;
    }
  }
  return v > 0 && Number.isFinite(v) ? Math.sqrt(v) : null;
}

/** Fills `r`; false when a point falls at or beyond the horizon. */
function residuals(p: number[], sc: Scaled, r: Float64Array): boolean {
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
function poses(h: Mat3, rects: Scaled["rects"]): number[] | null {
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

const STEP = 1e-6;

/** Levenberg-Marquardt. With no `start` it begins at the first reference's
 * own four-point solve; with one (a nearby solve's answer) it begins there
 * and keeps that solve's scaling. Stops when a step moves no unknown by more
 * than `tolerance` (the unknowns are of order one), not when the fit stops
 * improving: far from the known sizes the map can still be moving while the
 * residual barely changes. Null when the inputs do not define one surface. */
export function solveFused(
  inp: FuseInput,
  start?: FuseStart,
  maxIterations = 30,
  tolerance = 1e-9,
): FuseSolution | null {
  const image = start?.image ?? normOf(inp.first.taps),
    plane = start?.plane ?? normOf(inp.first.plane);
  if (!image || !plane) return null;
  const tap = (t: Pt): Pt => ({
      x: (t.x - image.cx) / image.s,
      y: (t.y - image.cy) / image.s,
      s: (t.s ?? inp.sigmaPx) / image.s,
    }),
    sc: Scaled = {
      first: {
        taps: inp.first.taps.map(tap),
        plane: inp.first.plane.map((c) => ({
          x: (c.x - plane.cx) / plane.s,
          y: (c.y - plane.cy) / plane.s,
        })),
      },
      // A further rectangle's own corners are only scaled: its offset on the
      // surface is one of the unknowns.
      rects: inp.rects.map((r) => ({
        taps: r.taps.map(tap),
        plane: r.plane.map((c) => ({ x: c.x / plane.s, y: c.y / plane.s })),
      })),
      spans: [],
    };
  let p: number[];
  if (start) p = start.params.slice();
  else {
    const h0 = solveHomography(sc.first.taps, sc.first.plane);
    if (!h0) return null;
    const lie = poses(h0, sc.rects);
    if (!lie) return null;
    p = [...h0.slice(0, 8).map((v) => v / h0[8]), ...lie];
  }
  for (const s of inp.spans) {
    const a = tap(s.a),
      b = tap(s.b),
      sd = spanSd(core(p), a, b, inp.tapeSigmaMm / plane.s);
    if (sd === null) return null;
    sc.spans.push({ a, b, len: s.mm / plane.s, sd });
  }
  const n = p.length,
    rows = 8 + 8 * sc.rects.length + sc.spans.length,
    sum = (v: Float64Array) => v.reduce((t, x) => t + x * x, 0);
  let r = new Float64Array(rows),
    rn = new Float64Array(rows);
  if (!residuals(p, sc, r)) return null;
  let c = sum(r),
    lambda = 1e-3,
    iterations = 0,
    done = false;
  const jac = Array.from({ length: n }, () => new Float64Array(rows)),
    a = Array.from({ length: n }, () => new Array<number>(n).fill(0)),
    grad = new Array<number>(n).fill(0),
    q = new Array<number>(n).fill(0);
  for (; iterations < maxIterations && !done; iterations++) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < n; k++) q[k] = p[k];
      q[i] += STEP;
      if (!residuals(q, sc, jac[i])) return null;
      for (let k = 0; k < rows; k++) jac[i][k] = (jac[i][k] - r[k]) / STEP;
    }
    for (let i = 0; i < n; i++) {
      let g = 0;
      for (let k = 0; k < rows; k++) g += jac[i][k] * r[k];
      grad[i] = -g;
      for (let j = i; j < n; j++) {
        let s = 0;
        for (let k = 0; k < rows; k++) s += jac[i][k] * jac[j][k];
        a[i][j] = a[j][i] = s;
      }
    }
    let gained = -1;
    for (let tries = 0; tries < 12 && gained < 0 && !done; tries++) {
      const damped = a.map((row, i) =>
          row.map((v, k) => (i === k ? v * (1 + lambda) + 1e-14 : v)),
        ),
        step = solveLinear(damped, grad);
      if (step && step.every((v) => Math.abs(v) < tolerance)) {
        done = true;
        break;
      }
      const next = step ? p.map((v, i) => v + step[i]) : null;
      if (next && residuals(next, sc, rn) && sum(rn) < c) {
        gained = c - sum(rn);
        if (step!.every((v) => Math.abs(v) < tolerance)) done = true;
        p = next;
        [r, rn] = [rn, r];
        c -= gained;
        lambda = Math.max(lambda / 10, 1e-9);
      } else lambda *= 10;
    }
    if (gained < 0) done = true;
  }
  const h = denormalize(core(p), image, plane),
    g = invert3(h),
    corners: Pt[] = [];
  if (!g || !h.every(Number.isFinite)) return null;
  for (const corner of inp.first.plane) {
    const at = toImage(g, h, corner.x, corner.y);
    if (!at) return null;
    corners.push(at);
  }
  const spare = rows - n;
  return {
    h,
    corners,
    chi: spare > 0 ? Math.sqrt(Math.max(0, c) / spare) : 0,
    iterations,
    start: { params: p, image, plane },
  };
}
