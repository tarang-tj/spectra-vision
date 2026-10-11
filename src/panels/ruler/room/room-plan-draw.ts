/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The room plan's own marks as drawing primitives, and which pictures give
// it pixels. The canvas and the saved SVG are both written from these.
import type { Pt } from "../homography";
import { COLORS, type Prim } from "../plan-layout";
import type { Fit } from "../topdown";
import { toRoomMap, type Layer } from "./room-plan";
import type { Extra } from "./room-scene";
import type { RoomSolution } from "./room-solve";
import { solved } from "./view-frame";
import type { View } from "./views-store";

/** The extras as drawing primitives in output pixels. */
export function layoutExtras(extras: readonly Extra[], fit: Fit): Prim[] {
  const { box, ppm } = fit,
    px = (p: Pt): [number, number] => [
      (p.x - box.x0) * ppm,
      (p.y - box.y0) * ppm,
    ],
    out: Prim[] = [];
  for (const e of extras) {
    if (e.kind === "ring") {
      const pts = e.pts.map(px);
      out.push({ t: "line", pts, closed: e.closed, color: e.color, width: 2 });
      // The label and its lines go inside the outline's top left corner.
      const x0 = Math.min(...pts.map((p) => p[0])),
        y0 = Math.min(...pts.map((p) => p[1]));
      [e.label, ...(e.more ?? [])].forEach((text, i) =>
        out.push({
          t: "text",
          x: (e.more ? x0 : pts[0][0]) + 5,
          y: (e.more ? y0 : pts[0][1]) + 13 + i * 13,
          text,
          color: i ? COLORS.text : e.color,
          size: 10,
        }),
      );
      e.legs?.forEach((text, i) => {
        const p = pts[i],
          q = pts[(i + 1) % pts.length];
        if (text)
          out.push({
            t: "text",
            x: (p[0] + q[0]) / 2,
            y: (p[1] + q[1]) / 2 - 5,
            text,
            color: e.color,
            size: 10,
            anchor: "middle",
          });
      });
      if (e.legs)
        pts.forEach(([x, y]) => out.push({ t: "dot", x, y, color: e.color }));
      continue;
    }
    const [x, y] = px(e.at);
    if (e.faint) {
      // A small cross: one picture's own estimate.
      for (const [dx, dy] of [
        [4, 4],
        [4, -4],
      ])
        out.push({
          t: "line",
          pts: [
            [x - dx, y - dy],
            [x + dx, y + dy],
          ],
          closed: false,
          color: COLORS.text,
          width: 1,
        });
      continue;
    }
    out.push({ t: "dot", x, y, color: e.color });
    if (e.label)
      out.push({
        t: "text",
        x: x + 6,
        y: y - 6,
        text: e.label,
        color: e.color,
        size: 10,
      });
  }
  return out;
}

/** The pictures to lay on the plan as pixels: those on the plan whose pixels
 * are at hand, each with its map into the room's frame. A picture that is
 * not on the plan gives no layer, whatever pixels it has. */
export function planLayers(
  views: readonly View[],
  solution: RoomSolution,
  pixels: (v: View) => Pick<Layer, "raster" | "scale"> | null,
): Layer[] {
  return views.flatMap((v) => {
    const rigid = solution.views.find((x) => x.id === v.id)?.rigid,
      px = rigid ? pixels(v) : null,
      d = px ? solved(v.snap).d : null;
    return rigid && px && d?.sheet
      ? [{ ...px, h: toRoomMap(rigid, d.sheet.h), lens: d.lens }]
      : [];
  });
}
