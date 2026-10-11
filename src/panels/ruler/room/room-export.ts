/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// "Save room plan": the CSV of the merged plan. One row per number with its
// bar and the pictures it rests on, one per room point with where each
// picture puts it, one per picture saying whether it is on the plan and why.
// Built as text; the panel hands it to the browser as a local download.
import { csvField } from "../export-plan";
import type { Pt } from "../homography";
import { toPlane } from "../shapes";
import { areaFromMm2, areaUnit, fromMm, type Unit } from "../units";
import { applyRigid } from "./room-frame";
import type { Quantity } from "./room-merge";
import { pointName, type RoomSolution } from "./room-solve";
import { roomBasis } from "./text";
import { solved } from "./view-frame";
import type { View } from "./views-store";

export const ROOM_CSV_HEADER =
  "item,measure,value,error_2sd,unit,pictures,room_frame_mm,basis,note";
const num = (v: number) => String(Number(v.toPrecision(8)));
const verts = (pts: Pt[]) =>
  pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("; ");

export function roomCsv(
  views: readonly View[],
  solution: RoomSolution,
  closed: boolean,
  unit: Unit,
): string {
  const order = views.map((v) => v.id),
    pics = (ids: number[]) =>
      ids
        .map((id) => order.indexOf(id) + 1)
        .sort((a, b) => a - b)
        .join("; "),
    rows: (string | number)[][] = [],
    kept = (q: Quantity) =>
      q.kept < 1
        ? `${Math.floor(q.kept * 100)}% of the simulated retakes could be used`
        : "";
  solution.views.forEach((v) =>
    // The column must say it as it is: a refused or provisional picture is
    // not on the plan, whatever the sentence beside it goes on to explain.
    rows.push([
      v.name,
      v.rigid ? "on the plan" : "not on the plan",
      "",
      "",
      "",
      "",
      "",
      "",
      v.text,
    ]),
  );
  const n = solution.numbers,
    corners = solution.corners.map((c) => c.sample!.at);
  if (n) {
    const all = roomBasis(solution.outlineViews, order),
      add = (
        measure: string,
        q: Quantity | null,
        area: boolean,
        ids: number[],
        pts: Pt[],
        basis: string,
      ) =>
        rows.push(
          q
            ? [
                "room",
                measure,
                num(area ? areaFromMm2(q.value, unit) : fromMm(q.value, unit)),
                num(area ? areaFromMm2(q.error, unit) : fromMm(q.error, unit)),
                area ? areaUnit(unit) : unit,
                pics(ids),
                verts(pts),
                basis,
                kept(q),
              ]
            : [
                "room",
                measure,
                "",
                "",
                area ? areaUnit(unit) : unit,
                pics(ids),
                "",
                basis,
                "not measured",
              ],
        );
    if (closed)
      add("floor area", n.area, true, solution.outlineViews, corners, all);
    add(
      closed ? "perimeter" : "length so far",
      n.length,
      false,
      solution.outlineViews,
      corners,
      all,
    );
    n.walls.forEach((w, i) =>
      add(
        `wall ${i + 1}`,
        w,
        false,
        solution.wallViews[i],
        [corners[i], corners[(i + 1) % corners.length]],
        roomBasis(solution.wallViews[i], order),
      ),
    );
  }
  for (const p of solution.points)
    rows.push([
      pointName(p.id).toLowerCase(),
      "position",
      "",
      "",
      "mm",
      pics(p.seen.map((s) => s.view)),
      p.sample ? verts([p.sample.at]) : "",
      "",
      !p.sample
        ? "not on the plan"
        : p.apartMm === null
          ? ""
          : `the pictures put it ${Math.round(p.apartMm)} mm apart: ${p.seen
              .map(
                (s) =>
                  `picture ${order.indexOf(s.view) + 1} at ${verts([s.at])}`,
              )
              .join(", ")}`,
    ]);
  // Each placed picture's own spans, paths and outlines, in the room's frame.
  views.forEach((v, k) => {
    const rigid = solution.views.find((x) => x.id === v.id)?.rigid;
    if (!rigid) return;
    const { s, d } = solved(v.snap, unit),
      name = `picture ${k + 1}`,
      turn = (pts: Pt[] | null) => (pts ?? []).map((p) => applyRigid(rigid, p));
    if (!d.sheet) return;
    const { h } = d.sheet;
    d.rows.forEach((r) => {
      const m = s.measures[r.index];
      if (!r.span || !m?.b) return;
      rows.push([
        `${name} span ${r.index + 1}`,
        "length",
        num(fromMm(r.span.mm, unit)),
        num(fromMm(r.span.errorMm, unit)),
        unit,
        k + 1,
        verts(turn(toPlane(h, [m.a, m.b], d.lens))),
        d.basis,
        "",
      ]);
    });
    d.shapes.forEach((r) => {
      const res = r.result;
      if (!res) return;
      rows.push([
        `${name} ${r.label.toLowerCase()}`,
        r.kind === "area" ? "perimeter" : "length",
        num(fromMm(res.length.value, unit)),
        num(fromMm(res.length.error, unit)),
        unit,
        k + 1,
        verts(turn(res.plane)),
        d.basis,
        "",
      ]);
      if (res.area)
        rows.push([
          `${name} ${r.label.toLowerCase()}`,
          "area",
          num(areaFromMm2(res.area.value, unit)),
          num(areaFromMm2(res.area.error, unit)),
          areaUnit(unit),
          k + 1,
          verts(turn(res.plane)),
          d.basis,
          "",
        ]);
    });
  });
  return (
    [ROOM_CSV_HEADER, ...rows.map((r) => r.map(csvField).join(","))].join(
      "\n",
    ) + "\n"
  );
}
