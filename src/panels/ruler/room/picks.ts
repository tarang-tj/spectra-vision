/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Points already placed in the room's pictures by the other tools, offered
// by name so one can be taken as a room point without tapping it again.
import type { Pt } from "../homography";
import type { View } from "./views-store";

export type Pick = { key: string; view: number; at: Pt; label: string };

/** Span ends, path and outline points and Walls floor corners of every
 * picture, each named with its picture. */
export function placedPoints(views: readonly View[]): Pick[] {
  const out: Pick[] = [];
  views.forEach((v, n) => {
    const name = `Picture ${n + 1}`,
      add = (key: string, at: Pt, label: string) =>
        out.push({
          key: `${v.id}:${key}`,
          view: v.id,
          at,
          label: `${name}: ${label}`,
        });
    v.snap.ruler.measures.forEach((m, i) => {
      add(`m${i}a`, m.a, `span ${i + 1}, first end`);
      if (m.b) add(`m${i}b`, m.b, `span ${i + 1}, second end`);
    });
    let paths = 0,
      areas = 0;
    v.snap.ruler.shapes.forEach((sh, i) => {
      if (sh.kind === "edge") return;
      const what =
        sh.kind === "area" ? `outline ${++areas}` : `path ${++paths}`;
      sh.pts.forEach((p, k) => add(`s${i}p${k}`, p, `${what}, point ${k + 1}`));
    });
    v.snap.walls.corners.forEach((c, i) =>
      add(`w${i}`, c.base, `Walls corner ${i + 1}`),
    );
  });
  return out;
}
