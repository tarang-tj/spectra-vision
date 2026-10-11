/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Positions on a floor and how well they are known: a turn and a shift
// between two frames, the spread of a position, and how far apart two
// positions are in units of their spread. Pure.
import type { Pt } from "../homography";

/** A turn and a shift on the floor: x' = a x - b y + tx, y' = b x + a y + ty.
 * With `mirror` it is a reflection instead: x' = a x + b y + tx,
 * y' = b x - a y + ty. A reflection is never where a picture is placed; it
 * is a rival that the shared points must rule out. */
export type Rigid = {
  /** Quarter turns between the picture's own frame and the room's. */
  turn: number;
  a: number;
  b: number;
  tx: number;
  ty: number;
  mirror?: true;
};
/** The spread of a floor position, mm squared. */
export type Cov = { xx: number; xy: number; yy: number };
/** A floor position (mm) and how well it is known. */
export type Fix = { at: Pt; cov: Cov };

export const IDENTITY: Rigid = { turn: 0, a: 1, b: 0, tx: 0, ty: 0 };
/** The four numbers of its linear part, row by row. */
const linear = (t: Rigid): [number, number, number, number] =>
  t.mirror ? [t.a, t.b, t.b, -t.a] : [t.a, -t.b, t.b, t.a];
export const applyRigid = (t: Rigid, p: Pt): Pt => {
  const [m, n, o, q] = linear(t);
  return { x: m * p.x + n * p.y + t.tx, y: o * p.x + q * p.y + t.ty };
};
/** The same spread, seen in the turned (or reflected) frame. */
export const turnCov = (t: Rigid, c: Cov): Cov => {
  const [m, n, o, q] = linear(t);
  return {
    xx: m * m * c.xx + 2 * m * n * c.xy + n * n * c.yy,
    xy: m * o * c.xx + (m * q + n * o) * c.xy + n * q * c.yy,
    yy: o * o * c.xx + 2 * o * q * c.xy + q * q * c.yy,
  };
};
export const addCov = (p: Cov, q: Cov): Cov => ({
  xx: p.xx + q.xx,
  xy: p.xy + q.xy,
  yy: p.yy + q.yy,
});

/** How many standard deviations two positions on a floor may be apart and
 * still be one point, when `anchors` such pairs are judged together: the
 * region that holds all of them 95 times in 100 when they are the same
 * points. (For one number that region is 2 sd; for one position on a floor
 * it is 2.45, and it grows slowly with the number of pairs, so that marking
 * more points does not by itself get a good picture refused.) */
export const limitFor = (anchors: number): number =>
  Math.sqrt(-2 * Math.log(0.05 / Math.max(1, anchors)));
/** Positions cannot be told apart finer than this, whatever the bars say. */
const FLOOR_MM2 = 1;

/** `d` in standard deviations of the spread `c`. */
export function inBars(d: Pt, c: Cov): number {
  const xx = c.xx + FLOOR_MM2,
    yy = c.yy + FLOOR_MM2,
    det = xx * yy - c.xy * c.xy;
  if (!(det > 0)) return Infinity;
  return Math.sqrt(
    Math.max(0, (yy * d.x * d.x - 2 * c.xy * d.x * d.y + xx * d.y * d.y) / det),
  );
}

/** A room-frame position as picture `rigid` reads it in its own frame. */
export const toOwn = (rigid: Rigid, p: Pt): Pt =>
  applyRigid(
    {
      turn: rigid.turn,
      a: rigid.a,
      b: -rigid.b,
      tx: -(rigid.a * rigid.tx + rigid.b * rigid.ty),
      ty: -(-rigid.b * rigid.tx + rigid.a * rigid.ty),
    },
    p,
  );
