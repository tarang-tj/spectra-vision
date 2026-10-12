/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The ways a reference sheet lies onto itself: its turns, which are the only
// ways two pictures of one sheet can differ, and its reflections, which a
// picture saved flipped reads the floor through. Pure: no DOM, no clock.
import type { Pt } from "../homography";
import { applyRigid, type Rigid } from "./floor-maths";

/** Every turn that lays the rectangle `from` (four corners in order, one
 * picture's own frame) exactly onto the rectangle `to` (the room's). Two for
 * a rectangle, four for a square, none when the sizes differ. */
export function symmetries(from: readonly Pt[], to: readonly Pt[]): Rigid[] {
  if (from.length !== 4 || to.length !== 4) return [];
  const out: Rigid[] = [],
    side = Math.hypot(from[1].x - from[0].x, from[1].y - from[0].y),
    tol = 1e-6 * Math.max(1, side);
  for (let turn = 0; turn < 4; turn++) {
    const p = to[turn],
      q = to[(turn + 1) % 4],
      angle =
        Math.atan2(q.y - p.y, q.x - p.x) -
        Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x),
      // The sheet's sides are square to its own axes: snap the turn.
      a = Math.round(Math.cos(angle)),
      b = Math.round(Math.sin(angle)),
      t: Rigid = {
        turn,
        a,
        b,
        tx: p.x - (a * from[0].x - b * from[0].y),
        ty: p.y - (b * from[0].x + a * from[0].y),
      };
    if (
      from.every((c, i) => {
        const m = applyRigid(t, c),
          want = to[(turn + i) % 4];
        return Math.hypot(m.x - want.x, m.y - want.y) <= tol;
      })
    )
      out.push(t);
  }
  return out;
}

/** Every reflection that lays the rectangle `from` onto the rectangle `to`:
 * two for a rectangle (across its two centre lines), four for a square (the
 * diagonals too), none when the sizes differ. A picture saved flipped left
 * to right reads the floor through one of these. */
export function reflections(from: readonly Pt[], to: readonly Pt[]): Rigid[] {
  if (from.length !== 4 || to.length !== 4) return [];
  const mid = (r: readonly Pt[]) => ({
      x: (r[0].x + r[2].x) / 2,
      y: (r[0].y + r[2].y) / 2,
    }),
    f = mid(from),
    g = mid(to),
    tol =
      1e-6 *
      Math.max(1, Math.hypot(from[2].x - from[0].x, from[2].y - from[0].y));
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].flatMap(([a, b], turn): Rigid[] => {
    const t: Rigid = {
      turn,
      a,
      b,
      tx: g.x - (a * f.x + b * f.y),
      ty: g.y - (b * f.x - a * f.y),
      mirror: true,
    };
    return from.every((c) => {
      const m = applyRigid(t, c);
      return to.some((w) => Math.hypot(m.x - w.x, m.y - w.y) <= tol);
    })
      ? [t]
      : [];
  });
}
