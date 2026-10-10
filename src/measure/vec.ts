/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Small 3-vector and 3x3 helpers for the camera model. Matrices are row-major
// arrays of nine numbers. Pure: no DOM, no clock, no randomness.

export type V3 = readonly [number, number, number];
export type M3 = readonly number[];

export const dot3 = (a: V3, b: V3): number =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const add3 = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const length3 = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
/** Unit vector, or null for a zero or non-finite one. */
export function unit3(a: V3): V3 | null {
  const n = length3(a);
  return Number.isFinite(n) && n > 1e-300 ? scale3(a, 1 / n) : null;
}

export const column = (m: M3, c: number): V3 => [m[c], m[3 + c], m[6 + c]];
export const mulVec = (m: M3, v: V3): V3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
export function mulMat(a: M3, b: M3): number[] {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++)
      out.push(
        a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c],
      );
  return out;
}
export const transpose = (m: M3): number[] => [
  m[0],
  m[3],
  m[6],
  m[1],
  m[4],
  m[7],
  m[2],
  m[5],
  m[8],
];
/** A matrix from three column vectors. */
export const fromColumns = (a: V3, b: V3, c: V3): number[] => [
  a[0],
  b[0],
  c[0],
  a[1],
  b[1],
  c[1],
  a[2],
  b[2],
  c[2],
];

/** Inverse of a 3x3 matrix, or null when it is singular. */
export function invert3(m: M3): number[] | null {
  const d =
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6]);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-300) return null;
  const out = [
    (m[4] * m[8] - m[5] * m[7]) / d,
    (m[2] * m[7] - m[1] * m[8]) / d,
    (m[1] * m[5] - m[2] * m[4]) / d,
    (m[5] * m[6] - m[3] * m[8]) / d,
    (m[0] * m[8] - m[2] * m[6]) / d,
    (m[2] * m[3] - m[0] * m[5]) / d,
    (m[3] * m[7] - m[4] * m[6]) / d,
    (m[1] * m[6] - m[0] * m[7]) / d,
    (m[0] * m[4] - m[1] * m[3]) / d,
  ];
  return out.every(Number.isFinite) ? out : null;
}

/** Rotation matrix for a rotation vector (axis times angle in radians). */
export function rodrigues(w: V3): number[] {
  const angle = length3(w);
  if (angle < 1e-12) return [1, -w[2], w[1], w[2], 1, -w[0], -w[1], w[0], 1];
  const [x, y, z] = scale3(w, 1 / angle),
    c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c;
  return [
    t * x * x + c,
    t * x * y - s * z,
    t * x * z + s * y,
    t * x * y + s * z,
    t * y * y + c,
    t * y * z - s * x,
    t * x * z - s * y,
    t * y * z + s * x,
    t * z * z + c,
  ];
}

/** Solve A x = b (A is n x n, row arrays) by Gaussian elimination with
 * partial pivoting. Null when the system is singular. */
export function solveLinear(a: number[][], b: number[]): number[] | null {
  const n = b.length,
    m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(m[r][col]) > Math.abs(m[best][col])) best = r;
    if (!(Math.abs(m[best][col]) > 1e-300)) return null;
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
  return x.every(Number.isFinite) ? x : null;
}
