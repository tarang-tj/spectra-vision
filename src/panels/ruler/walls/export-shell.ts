/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls numbers as a CSV: every value with its bar, its unit and whether
// it was measured or assumed, then the basis. Text only; nothing is uploaded.
import type { Measured } from "../../../measure/noise";
import type { Unit } from "../units";
import type { Numbers, Q } from "./numbers";
import { areaOf, BASIS, lengthOf, volumeOf } from "./text";

export const WALLS_CSV_HEADER = "quantity,value,error (2 sd),unit,status";
const field = (v: string | number) =>
  typeof v === "number"
    ? String(v)
    : /[",\n]/.test(v)
      ? `"${v.replace(/"/g, '""')}"`
      : v;

export function wallsCsv(n: Numbers, unit: Unit, why: string | null): string {
  const rows: (string | number)[][] = [],
    put = (
      name: string,
      q: Q | null,
      as: (q: Q, unit: Unit) => Measured,
      missing: string,
      status = "measured",
    ) => {
      if (!q) return rows.push([name, "", "", "", missing]);
      const m = as(q, unit);
      rows.push([name, m.value, m.error, m.unit, status]);
    },
    none = why ?? "not measured";
  n.walls.forEach((q, i) =>
    put(`Wall ${i + 1} length`, q, lengthOf, "not measured"),
  );
  n.shell.heights.forEach((z, i) => {
    if (z !== null) put(`Corner ${i + 1} height`, n.heights[i], lengthOf, none);
    else
      put(
        `Corner ${i + 1} height`,
        n.meanHeight,
        lengthOf,
        none,
        "assumed: the mean of the measured heights, not measured here",
      );
  });
  put("Mean height", n.meanHeight, lengthOf, none);
  put(
    "Floor area",
    n.floorArea,
    areaOf,
    "not measured: the outline is open or crosses itself",
  );
  put("Wall area", n.wallArea, areaOf, none);
  put("Volume", n.volume, volumeOf, none);
  rows.push(["Basis", "", "", "", BASIS]);
  return (
    [WALLS_CSV_HEADER, ...rows.map((r) => r.map(field).join(","))].join("\n") +
    "\n"
  );
}
