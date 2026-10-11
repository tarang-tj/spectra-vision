/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Plane geometry for the Box tool, all in mm on the reference plane: the
// box's footprint and how much room it has inside an outline. Pure.

export type P = { x: number; y: number };
export type Footprint = {
  w: number;
  d: number;
  x: number;
  y: number;
  rot: number;
};

/** A length below which two things count as touching, mm. */
const EPS = 1e-6;
/** Points checked along each footprint side, corners included. */
const SAMPLES = 16;

/** The four corners of the footprint, in order round it. Corner 0 is at minus
 * half the width and minus half the depth before the turn; the turn is
 * counter-clockwise in plane coordinates, in degrees. */
export function footprintCorners(b: Footprint): P[] {
  const a = (b.rot * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => {
    const u = (i * b.w) / 2,
      v = (j * b.d) / 2;
    return { x: b.x + u * c - v * s, y: b.y + u * s + v * c };
  });
}

const cross = (o: P, a: P, b: P) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/** Distance from a point to a segment. */
export function pointToSegment(p: P, a: P, b: P): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len = dx * dx + dy * dy,
    t =
      len > 0
        ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
        : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Do two segments cross properly (touching ends do not count)? */
const crosses = (a: P, b: P, c: P, d: P): boolean =>
  cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0;

/** Smallest distance between two segments; 0 when they cross. */
export function segmentDistance(a: P, b: P, c: P, d: P): number {
  if (crosses(a, b, c, d)) return 0;
  return Math.min(
    pointToSegment(a, c, d),
    pointToSegment(b, c, d),
    pointToSegment(c, a, b),
    pointToSegment(d, a, b),
  );
}

const sides = (poly: readonly P[]): [P, P][] =>
  poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);

/** Distance from a point to the nearest side of a closed outline. */
export const toBoundary = (p: P, poly: readonly P[]): number =>
  Math.min(...sides(poly).map(([a, b]) => pointToSegment(p, a, b)));

/** Is the point inside the outline, by counting crossings of a ray? A point on
 * a side may come out either way: check `toBoundary` first when it matters. */
function rayInside(p: P, poly: readonly P[]): boolean {
  let inside = false;
  for (const [a, b] of sides(poly))
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)
    )
      inside = !inside;
  return inside;
}

/** Is the point inside the outline or on one of its sides? */
export const containsPoint = (p: P, poly: readonly P[]): boolean =>
  toBoundary(p, poly) <= EPS || rayInside(p, poly);

/** How far the point is outside the outline; 0 when inside or on a side. */
function outsideBy(p: P, poly: readonly P[]): number {
  const d = toBoundary(p, poly);
  return d <= EPS || rayInside(p, poly) ? 0 : d;
}

/** The room the footprint has inside the outline, mm. Positive: the smallest
 * distance from the footprint to any side of the outline. Negative when any
 * part of the footprint is outside: minus the furthest any checked point of
 * the footprint's edge lies beyond the outline (or, for a corner of the
 * outline that pokes into the footprint, how deep it pokes). Zero: touching.
 * Both shapes are simple polygons; the outline need not be convex. */
export function clearance(foot: readonly P[], outline: readonly P[]): number {
  let over = 0,
    out = false;
  for (const [a, b] of sides(foot))
    for (let i = 0; i < SAMPLES; i++) {
      const t = i / SAMPLES,
        by = outsideBy(
          { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
          outline,
        );
      if (by > 0) out = true;
      over = Math.max(over, by);
    }
  // A corner of the outline inside the footprint (the inner corner of an
  // L-shaped room): part of the footprint is beyond it.
  for (const v of outline) {
    const d = toBoundary(v, foot);
    if (d > EPS && rayInside(v, foot)) {
      out = true;
      over = Math.max(over, d);
    }
  }
  let gap = Infinity;
  for (const [a, b] of sides(foot))
    for (const [c, d] of sides(outline)) {
      if (crosses(a, b, c, d)) out = true;
      gap = Math.min(gap, segmentDistance(a, b, c, d));
    }
  return out ? 0 - over : gap;
}

/** Sample standard deviation; NaN with fewer than two values. */
export function sampleSd(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return NaN;
  const mean = values.reduce((t, v) => t + v, 0) / n;
  return Math.sqrt(values.reduce((t, v) => t + (v - mean) ** 2, 0) / (n - 1));
}
