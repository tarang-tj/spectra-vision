/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the room plan contains, in the room's frame: the reference, every
// placed picture's spans, paths and outlines, its box and its Walls outline,
// and the room's own points and outline. A picture that is not on the plan
// contributes nothing. The canvas and the saved SVG draw from this.
import type { Pt } from "../homography";
import { COLORS } from "../plan-layout";
import { buildScene, type PlanItem, type PlanScene } from "../plan-scene";
import { readingText, shortReading } from "../reading";
import { toPlane } from "../shapes";
import type { Unit } from "../units";
import { ROOM } from "./overlay";
import { applyRigid } from "./room-frame";
import type { RoomSolution } from "./room-solve";
import type { RoomState } from "./store";
import { areaOf, lengthOf } from "./text";
import { solved } from "./view-frame";
import type { View } from "./views-store";

/** Something drawn that is not a Ruler shape: lines and labelled dots. */
export type Extra =
  | {
      kind: "ring";
      pts: Pt[];
      closed: boolean;
      color: string;
      label: string;
      /** One label per side, and lines written under the label. */
      legs?: string[];
      more?: string[];
    }
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
    const { s, d } = solved(v.snap, unit),
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
    const read = (m: ReturnType<typeof lengthOf>) =>
      shortReading(readingText(m));
    // Not a Ruler shape: its label goes in a corner of the outline, clear of
    // the reference, which usually lies near the middle of the room.
    extras.push({
      kind: "ring",
      closed: room.closed,
      color: COLORS.area,
      label: "Room",
      pts: corners,
      legs: numbers.walls.map((w) => (w ? read(lengthOf(w, unit, "")) : "")),
      more: [
        numbers.area ? `area ${read(areaOf(numbers.area, unit, ""))}` : "",
        numbers.selfIntersecting ? "crosses itself, no area" : "",
        numbers.length
          ? `${room.closed ? "perimeter" : "length"} ${read(lengthOf(numbers.length, unit, ""))}`
          : "",
      ].filter(Boolean),
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
