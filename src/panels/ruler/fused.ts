/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One plane map from every known size in the picture, by least squares. Every
// residual is a miss divided by its own standard deviation, so nothing needs a
// hand-set weight:
//   - a rectangle corner: where the model puts it minus where it was tapped,
//     in pixels, over the tap uncertainty;
//   - a known span: its length on the plane minus the typed length, over the
//     tap uncertainty of both ends carried through the local scale (mm per
//     pixel along the span at each end) combined with the tape uncertainty.
// The unknowns are the picture positions of the first reference's four
// corners (which fix the map) and, for each further rectangle, where it lies
// on the surface (two offsets and a turn). Pure: no DOM, no randomness.
import {
  applyHomography,
  solveHomography,
  solveLinear,
  type Mat3,
  type Pt,
} from "./homography";

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
  params: number[];
  /** Root mean square residual per spare constraint, in standard deviations:
   * about 1 when the known sizes agree as well as tap error allows. */
  chi: number;
  iterations: number;
};

type Model = { h: Mat3; g: Mat3 | null };
const sd = (p: Pt, inp: FuseInput) => p.s ?? inp.sigmaPx;

function invert3(m: Mat3): Mat3 | null {
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

function model(p: number[], inp: FuseInput): Model | null {
  const v = [0, 1, 2, 3].map((i) => ({ x: p[2 * i], y: p[2 * i + 1] })),
    h = solveHomography(v, inp.first.plane);
  if (!h) return null;
  if (!inp.rects.length) return { h, g: null };
  const g = invert3(h);
  return g ? { h, g } : null;
}

/** Plane distance of a span, or null at the horizon. */
function spanMm(h: Mat3, a: Pt, b: Pt): number | null {
  const pa = applyHomography(h, a),
    pb = applyHomography(h, b);
  return pa && pb ? Math.hypot(pa.x - pb.x, pa.y - pb.y) : null;
}

/** One sd of each known span's length (mm): both ends' tap sd through the
 * local scale, and the tape. Held fixed for the whole solve. */
function spanSds(h: Mat3, inp: FuseInput): number[] | null {
  const out: number[] = [];
  for (const s of inp.spans) {
    let v = inp.tapeSigmaMm ** 2;
    for (const [end, other] of [
      [s.a, s.b],
      [s.b, s.a],
    ]) {
      for (const [dx, dy] of [
        [0.5, 0],
        [0, 0.5],
      ]) {
        const up = spanMm(h, { x: end.x + dx, y: end.y + dy }, other),
          down = spanMm(h, { x: end.x - dx, y: end.y - dy }, other);
        if (up === null || down === null) return null;
        v += ((up - down) * sd(end, inp)) ** 2;
      }
    }
    if (!(v > 0) || !Number.isFinite(v)) return null;
    out.push(Math.sqrt(v));
  }
  return out;
}

function residuals(
  p: number[],
  m: Model,
  inp: FuseInput,
  spanSd: number[],
): number[] | null {
  const r: number[] = [];
  inp.first.taps.forEach((t, i) => {
    r.push((p[2 * i] - t.x) / sd(t, inp), (p[2 * i + 1] - t.y) / sd(t, inp));
  });
  for (let j = 0; j < inp.rects.length; j++) {
    const g = m.g!,
      rect = inp.rects[j],
      tx = p[8 + 3 * j],
      ty = p[9 + 3 * j],
      cos = Math.cos(p[10 + 3 * j]),
      sin = Math.sin(p[10 + 3 * j]);
    for (let k = 0; k < 4; k++) {
      const c = rect.plane[k],
        x = tx + c.x * cos - c.y * sin,
        y = ty + c.x * sin + c.y * cos,
        // g has an arbitrary sign; h maps the model point back with w > 0
        // exactly when it is in front of the horizon.
        w = g[6] * x + g[7] * y + g[8],
        ix = (g[0] * x + g[1] * y + g[2]) / w,
        iy = (g[3] * x + g[4] * y + g[5]) / w;
      if (!Number.isFinite(ix) || !Number.isFinite(iy)) return null;
      if (!(m.h[6] * ix + m.h[7] * iy + m.h[8] > 1e-6)) return null;
      const t = rect.taps[k];
      r.push((ix - t.x) / sd(t, inp), (iy - t.y) / sd(t, inp));
    }
  }
  for (let i = 0; i < inp.spans.length; i++) {
    const s = inp.spans[i],
      d = spanMm(m.h, s.a, s.b);
    if (d === null) return null;
    r.push((d - s.mm) / spanSd[i]);
  }
  return r;
}

/** Where to start: the first reference's own four-point solve, and each
 * further rectangle laid where that solve sees it (best rigid fit). */
export function fuseStart(inp: FuseInput): number[] | null {
  const h = solveHomography(inp.first.taps, inp.first.plane);
  if (!h) return null;
  const p = inp.first.taps.flatMap((t) => [t.x, t.y]);
  for (const rect of inp.rects) {
    const q: Pt[] = [];
    for (const t of rect.taps) {
      const at = applyHomography(h, t);
      if (!at) return null;
      q.push(at);
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
    p.push(
      qx - (cx * Math.cos(th) - cy * Math.sin(th)),
      qy - (cx * Math.sin(th) + cy * Math.cos(th)),
      th,
    );
  }
  return p;
}

const cost = (r: number[]) => r.reduce((s, v) => s + v * v, 0);
// Finite-difference steps: pixels, millimetres, radians.
const stepOf = (i: number) => (i < 8 ? 1e-3 : (i - 8) % 3 === 2 ? 1e-7 : 1e-2);

/** Levenberg-Marquardt from `start` (default: `fuseStart`). Null when the
 * inputs do not define one surface. */
export function solveFused(
  inp: FuseInput,
  start?: number[],
  maxIterations = 30,
): FuseSolution | null {
  let p = start ? start.slice() : fuseStart(inp);
  if (!p) return null;
  let m = model(p, inp);
  if (!m) return null;
  const spanSd = spanSds(m.h, inp);
  if (!spanSd) return null;
  let r = residuals(p, m, inp, spanSd);
  if (!r) return null;
  let c = cost(r),
    lambda = 1e-3,
    iterations = 0;
  const n = p.length;
  for (; iterations < maxIterations; iterations++) {
    // Columns for the map's eight numbers need a new map; the others do not.
    const jac: number[][] = [];
    for (let i = 0; i < n; i++) {
      const q = p.slice();
      q[i] += stepOf(i);
      const mq = i < 8 ? model(q, inp) : m,
        rq = mq ? residuals(q, mq, inp, spanSd) : null;
      if (!rq) return null;
      jac.push(rq.map((v, k) => (v - r![k]) / stepOf(i)));
    }
    const a = jac.map((ji) =>
        jac.map((jk) => ji.reduce((s, v, t) => s + v * jk[t], 0)),
      ),
      grad = jac.map((ji) => ji.reduce((s, v, t) => s + v * r![t], 0));
    let gained = -1;
    for (let tries = 0; tries < 12 && gained < 0; tries++) {
      const damped = a.map((row, i) =>
          row.map((v, k) => (i === k ? v * (1 + lambda) + 1e-12 : v)),
        ),
        step = solveLinear(
          damped,
          grad.map((v) => -v),
        ),
        next = step ? p.map((v, i) => v + step[i]) : null,
        mn = next ? model(next, inp) : null,
        rn = next && mn ? residuals(next, mn, inp, spanSd) : null;
      if (next && mn && rn && cost(rn) < c) {
        gained = c - cost(rn);
        p = next;
        m = mn;
        r = rn;
        c = cost(rn);
        lambda = Math.max(lambda / 10, 1e-9);
      } else lambda *= 10;
    }
    if (gained < 0 || gained <= 1e-9 * (1 + c)) break;
  }
  const spare = r.length - n;
  return {
    h: m.h,
    params: p,
    chi: spare > 0 ? Math.sqrt(c / spare) : 0,
    iterations,
  };
}
