/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the room plan contains, in the room's frame: the reference, every
// placed picture's spans, paths and outlines, its box and its Walls outline,
// and the room's own points and outline. A picture that is not on the plan
// contributes nothing. The canvas and the saved SVG draw from this.
import { derive } from "../derive";
import type { Pt } from "../homography";
import { COLORS, type Prim } from "../plan-layout";
import { buildScene, type PlanItem, type PlanScene } from "../plan-scene";
import { readingText, shortReading } from "../reading";
import { toPlane } from "../shapes";
import type { Fit } from "../topdown";
import type { Unit } from "../units";
import { ROOM } from "./overlay";
import { applyRigid } from "./room-frame";
import { toRoomMap, type Layer } from "./room-plan";
import type { RoomSolution } from "./room-solve";
import type { RoomState } from "./store";
import { areaOf, lengthOf } from "./text";
import { stateOf } from "./view-frame";
import type { View } from "./views-store";

/** Something drawn that is not a Ruler shape: lines and labelled dots. */
type Extra =
  | { kind: "ring"; pts: Pt[]; closed: boolean; color: string; label: string }
  | { kind: "dot"; at: Pt; color: string; label: string; faint?: boolean };
export type RoomScene = {
  scene: PlanScene;
  extras: Extra[];
  /** Ids of the pictures drawn. */
  placed: number[];
};
const BOX = "#ffd18d",
  WALL = "#d9b3ff";

export function roomScene(
  views: readonly View[],
  solution: RoomSolution,
  room: RoomState,
  unit: Unit,
  basis: string,
): RoomScene | null {
  const items: PlanItem[] = [],
    extras: Extra[] = [],
    placed: number[] = [];
  views.forEach((v, n) => {
    const rigid = solution.views.find((x) => x.id === v.id)?.rigid;
    if (!rigid) return;
    const s = { ...stateOf(v.snap), unit },
      d = derive(s),
      own = buildScene(s, d),
      name = `picture ${n + 1}`,
      turn = (p: Pt) => applyRigid(rigid, p);
    if (!own || !d.sheet) return;
    placed.push(v.id);
    for (const item of own.items) {
      // One sheet: the first picture's outline of it is the plan's.
      if (item.kind === "reference" && placed.length > 1) continue;
      const pts = item.pts.map(turn);
      items.push(
        item.kind === "path" || item.kind === "area"
          ? { ...item, pts, name: `${item.name}, ${name}` }
          : { ...item, pts },
      );
    }
    const { box, walls } = v.snap;
    if (box.at) {
      const a = (box.rot * Math.PI) / 180,
        c = Math.cos(a),
        k = Math.sin(a),
        at = box.at;
      extras.push({
        kind: "ring",
        closed: true,
        color: BOX,
        label: `box, ${name}`,
        pts: [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([x, y]) =>
          turn({
            x: at.x + (x * box.w * c - y * box.d * k) / 2,
            y: at.y + (x * box.w * k + y * box.d * c) / 2,
          }),
        ),
      });
    }
    const floor = toPlane(
      d.sheet.h,
      walls.corners.map((w) => w.base),
      d.lens,
    );
    if (floor && floor.length >= 2) {
      extras.push({
        kind: "ring",
        closed: walls.closed,
        color: WALL,
        label: `Walls, ${name}`,
        pts: floor.map(turn),
      });
      // Heights belong to the picture they were tapped in; the plan only
      // says where one was measured.
      walls.corners.forEach((w, i) => {
        if (w.top)
          extras.push({
            kind: "dot",
            at: turn(floor[i]),
            color: WALL,
            label: `height, ${name}`,
          });
      });
    }
  });
  if (!items.length) return null;
  const numbers = solution.numbers,
    corners = solution.corners.map((c) => c.sample!.at);
  if (numbers && corners.length >= 2) {
    const text = (i: number) => {
      const w = numbers.walls[i];
      return w ? shortReading(readingText(lengthOf(w, unit, ""))) : "";
    };
    items.push({
      kind: room.closed ? "area" : "path",
      name: "Room",
      pts: corners,
      legs: numbers.walls.map((_, i) => text(i)),
      length: numbers.length
        ? shortReading(readingText(lengthOf(numbers.length, unit, "")))
        : "not measured",
      area: numbers.area
        ? shortReading(readingText(areaOf(numbers.area, unit, "")))
        : null,
      note: numbers.selfIntersecting ? "crosses itself, no area" : null,
    });
  }
  for (const p of solution.points) {
    if (!p.sample) continue;
    // Where each picture alone puts a point marked in several, faintly,
    // under where the plan puts it.
    if (p.seen.length > 1)
      for (const s of p.seen)
        extras.push({
          kind: "dot",
          at: s.at,
          color: ROOM,
          label: "",
          faint: true,
        });
    extras.push({
      kind: "dot",
      at: p.sample.at,
      color: ROOM,
      label:
        p.apartMm === null
          ? `R${p.id}`
          : `R${p.id}, ${Math.round(p.apartMm)} mm apart`,
    });
  }
  const all = [
    ...items.flatMap((i) => i.pts),
    ...extras.flatMap((e) => (e.kind === "ring" ? e.pts : [e.at])),
  ];
  return {
    scene: {
      items,
      bounds: {
        x0: Math.min(...all.map((p) => p.x)),
        y0: Math.min(...all.map((p) => p.y)),
        x1: Math.max(...all.map((p) => p.x)),
        y1: Math.max(...all.map((p) => p.y)),
      },
      basis,
      unit,
    },
    extras,
    placed,
  };
}

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
      out.push({
        t: "text",
        x: pts[0][0] + 4,
        y: pts[0][1] + 13,
        text: e.label,
        color: e.color,
        size: 10,
      });
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
      d = px ? derive(stateOf(v.snap)) : null;
    return rigid && px && d?.sheet
      ? [{ ...px, h: toRoomMap(rigid, d.sheet.h), lens: d.lens }]
      : [];
  });
}
