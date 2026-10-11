/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The room file: one JSON document a person saves and opens themselves.
// It holds what was tapped (per picture: the reference, spans, shapes, known
// sizes, box, walls; the room's points and outline), the pictures only when
// asked for, and the numbers with their bars for reading by people. On
// opening, every number is worked out again from the taps and compared with
// the saved one. Pure: no DOM. Nothing is uploaded.
import { measured } from "../../../measure/noise";
import { readingText } from "../reading";
import { areaFromMm2, areaUnit, fromMm, type Unit } from "../units";
import type { Quantity } from "./room-merge";
import type { RoomPoint, RoomSolution } from "./room-solve";
import { areaOf, lengthOf, roomBasis } from "./text";
import { solved } from "./view-frame";
import type { View, ViewSnap } from "./views-store";

export const ROOM_FILE_APP = "spectra-room";
export const ROOM_FILE_VERSION = 1;
/** Open room refuses anything larger, bytes. */
export const MAX_FILE_BYTES = 60 * 1024 * 1024;

/** One number as saved: for people, and for the check on opening. */
export type SavedNumber = {
  name: string;
  value: number;
  error: number;
  unit: string;
  /** Strip numbers of the pictures it rests on. */
  pictures: number[];
  text: string;
  basis: string;
};
export type SavedView = ViewSnap & {
  id: number;
  label: string;
  /** `data:image/jpeg` or `data:image/png`, only when the box was ticked. */
  picture?: string;
};
export type RoomFile = {
  app: typeof ROOM_FILE_APP;
  version: typeof ROOM_FILE_VERSION;
  saved: string;
  unit: Unit;
  reference: { label: string; long: number; short: number } | null;
  views: SavedView[];
  points: RoomPoint[];
  outline: number[];
  closed: boolean;
  /** Which pictures were on the plan when it was saved, in words. */
  placements: { picture: number; state: string; text: string }[];
  numbers: SavedNumber[];
  note: string;
};

/** Every number the room and its pictures give, in `unit`: the outline's
 * area, perimeter and walls, then each picture's own spans and shapes. */
export function derivedNumbers(
  views: readonly View[],
  solution: RoomSolution,
  closed: boolean,
  unit: Unit,
): SavedNumber[] {
  const order = views.map((v) => v.id),
    strip = (ids: number[]) =>
      ids.map((id) => order.indexOf(id) + 1).sort((a, b) => a - b),
    out: SavedNumber[] = [],
    add = (name: string, q: Quantity | null, area: boolean, ids: number[]) => {
      if (!q) return;
      const basis = roomBasis(ids, order),
        m = area ? areaOf(q, unit, basis) : lengthOf(q, unit, basis);
      out.push({
        name,
        value: m.value,
        error: m.error,
        unit: m.unit,
        pictures: strip(ids),
        text: readingText(m),
        basis,
      });
    },
    n = solution.numbers;
  if (n) {
    if (closed) add("room floor area", n.area, true, solution.outlineViews);
    add(
      closed ? "room perimeter" : "room length so far",
      n.length,
      false,
      solution.outlineViews,
    );
    n.walls.forEach((w, i) =>
      add(`room wall ${i + 1}`, w, false, solution.wallViews[i]),
    );
  }
  views.forEach((v, k) => {
    const { d } = solved(v.snap, unit),
      own = (name: string, mm: number, errorMm: number, area: boolean) => {
        const m = measured(
          area ? areaFromMm2(mm, unit) : fromMm(mm, unit),
          area ? areaFromMm2(errorMm, unit) : fromMm(errorMm, unit),
          area ? areaUnit(unit) : unit,
          d.basis,
        );
        out.push({
          name: `picture ${k + 1} ${name}`,
          value: m.value,
          error: m.error,
          unit: m.unit,
          pictures: [k + 1],
          text: readingText(m),
          basis: m.basis,
        });
      };
    d.rows.forEach((r) => {
      if (r.span) own(`span ${r.index + 1}`, r.span.mm, r.span.errorMm, false);
    });
    d.shapes.forEach((r) => {
      if (!r.result) return;
      const label = r.label.toLowerCase();
      own(
        `${label} ${r.kind === "area" ? "perimeter" : "length"}`,
        r.result.length.value,
        r.result.length.error,
        false,
      );
      if (r.result.area)
        own(`${label} area`, r.result.area.value, r.result.area.error, true);
    });
  });
  return out;
}

/** The file for this room. `pictures` maps a view id to its data URL, for
 * the views whose picture goes in; pass an empty map to leave them out. */
export function roomFile(
  views: readonly View[],
  room: {
    points: readonly RoomPoint[];
    outline: readonly number[];
    closed: boolean;
  },
  solution: RoomSolution,
  unit: Unit,
  pictures: ReadonlyMap<number, string>,
  saved: string,
): RoomFile {
  const first = views[0] ? solved(views[0].snap).d.reference : null;
  return {
    app: ROOM_FILE_APP,
    version: ROOM_FILE_VERSION,
    saved,
    unit,
    reference: first
      ? { label: first.label, long: first.long, short: first.short }
      : null,
    views: views.map((v) => ({
      id: v.id,
      label: v.label,
      ...v.snap,
      ...(pictures.has(v.id) ? { picture: pictures.get(v.id)! } : {}),
    })),
    points: room.points.map((p) => ({ id: p.id, obs: [...p.obs] })),
    outline: [...room.outline],
    closed: room.closed,
    placements: solution.views.map((v, i) => ({
      picture: i + 1,
      state: v.state,
      text: v.text,
    })),
    numbers: derivedNumbers(views, solution, room.closed, unit),
    note: pictures.size
      ? "Positions are in source pixels of each picture. The numbers are for reading; opening the file works every one out again from the taps."
      : "The pictures are not in this file. Positions are in source pixels of each picture. The numbers are for reading; opening the file works every one out again from the taps.",
  };
}

/** Names of saved numbers that the taps no longer give, each with both
 * values: "to rounding" is one part in a million. Empty when all agree. */
export function numbersThatDiffer(
  saved: readonly SavedNumber[],
  now: readonly SavedNumber[],
): string[] {
  const close = (a: number, b: number) =>
      Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)),
    by = new Map(now.map((n) => [n.name, n])),
    show = (n: SavedNumber) =>
      `${Number(n.value.toPrecision(7))} ± ${Number(n.error.toPrecision(3))} ${n.unit}`,
    out: string[] = [];
  for (const s of saved) {
    const n = by.get(s.name);
    if (!n) out.push(`${s.name}: saved as ${show(s)}, not given now`);
    else if (
      !close(s.value, n.value) ||
      !close(s.error, n.error) ||
      s.unit !== n.unit
    )
      out.push(`${s.name}: saved as ${show(s)}, now ${show(n)}`);
  }
  for (const n of now)
    if (!saved.some((s) => s.name === n.name))
      out.push(`${n.name}: not in the file, now ${show(n)}`);
  return out;
}
