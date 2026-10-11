/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// How the room's numbers and steps are worded. Every number is a Measured
// whose basis says how many pictures it rests on and what the bar covers.
import { measured, type Measured } from "../../../measure/noise";
import { areaFromMm2, areaUnit, fromMm, type Unit } from "../units";
import type { Quantity } from "./room-merge";
import { ROOM_TRIALS } from "./view-frame";

const list = (names: string[]) =>
  names.length < 2
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** "pictures 1, 2 and 4" for picture ids, by their place in the strip. */
export function picturesText(views: number[], order: number[]): string {
  const n = views
    .map((id) => order.indexOf(id) + 1)
    .filter((i) => i > 0)
    .sort((a, b) => a - b)
    .map(String);
  return `picture${n.length === 1 ? "" : "s"} ${list(n)}`;
}

/** What a bar on a room number covers, word for word. */
export function roomBasis(views: number[], order: number[]): string {
  const n = views.length,
    those = n === 1 ? "that picture" : "those pictures";
  return `Rests on ${n} picture${n === 1 ? "" : "s"} (${picturesText(views, order)}). The bar is 2 standard deviations over ${ROOM_TRIALS} simulated retakes of every tap in ${those}: the reference corners of each and the room points themselves, each moved by the tap uncertainty, with a point marked in more than one picture weighted by how well each picture fixes it. Not included: lens distortion left uncorrected, points off the floor, a bent or misprinted reference, a sheet that moved between pictures by less than the bars could show, and two shared points that are both mistaken for their look-alikes on the other side of the sheet, in a room that looks the same from both sides of it.`;
}

export const lengthOf = (q: Quantity, unit: Unit, basis: string): Measured =>
  measured(fromMm(q.value, unit), fromMm(q.error, unit), unit, basis);
export const areaOf = (q: Quantity, unit: Unit, basis: string): Measured =>
  measured(
    areaFromMm2(q.value, unit),
    areaFromMm2(q.error, unit),
    areaUnit(unit),
    basis,
  );
