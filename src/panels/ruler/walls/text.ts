/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Wording and units for the Walls numbers, shared by the panel, the stage
// labels and the CSV.
import { measured, type Measured } from "../../../measure/noise";
import { DEFAULT_TRIALS } from "../camera-of";
import type { Derived } from "../derive";
import { basisFor, TAP_SIGMA_SCREEN_PX } from "../monte-carlo";
import { readingText, shortReading, tooUncertain } from "../reading";
import { areaFromMm2, bigAreaUnit, fromMm, type Unit } from "../units";
import type { Numbers, Q } from "./numbers";
import type { WallsState } from "./store";

/** What every Walls bar covers and what it leaves out, word for word. The
 * retakes are the Ruler's own (camera-of.ts), so the middle of the sentence
 * is the Ruler's: with further references or known spans fused in, it names
 * their corners, their ends and the tape uncertainty too. */
export const basisOf = (d: Pick<Derived, "lens" | "sheet">): string =>
  `2 standard deviations over ${DEFAULT_TRIALS} simulated retakes in which every number is worked out again. Each retake moves every Walls tap by ${TAP_SIGMA_SCREEN_PX} screen pixels and redoes the Ruler's solve of the floor, whose own basis is: ${basisFor(d.lens, d.sheet?.fused)} Assumes a flat floor, plumb walls, a flat ceiling, one picture, square pixels and the optical axis through the middle of the picture. Also not included: corners hidden or guessed behind furniture, sloped ceilings, curved walls.`;

export const NO_CEILING =
  "not measured: no ceiling point yet. Close the room, then tap where a wall edge meets the ceiling.";
export const NO_FOCAL =
  "not measured: this picture does not pin down the camera's focal length. Retake it with the camera tilted so the floor runs away from you, or move a ceiling point onto a clearly plumb wall edge.";
export const UNSTABLE =
  "not measured: too many of the simulated retakes gave no answer, so there is no honest bar. Use a bigger reference or a picture taken closer.";

export const NOT_ABOVE =
  "not measured: the ceiling point does not sit above its corner in the picture. Drag it onto the wall edge, above the corner.";

export const lengthOf = (q: Q, unit: Unit, basis: string): Measured =>
  measured(fromMm(q.value, unit), fromMm(q.error, unit), unit, basis);
/** Areas read in square metres or square feet, whichever fits the unit. */
export function areaOf(q: Q, unit: Unit, basis: string): Measured {
  const big = bigAreaUnit(unit);
  return measured(
    areaFromMm2(q.value, big),
    areaFromMm2(q.error, big),
    `${big}²`,
    basis,
  );
}
export function volumeOf(q: Q, unit: Unit, basis: string): Measured {
  const big = bigAreaUnit(unit),
    k = fromMm(1, big) ** 3;
  return measured(q.value * k, q.error * k, `${big}³`, basis);
}
/** A length for a stage label or the middle of a sentence: the short form
 * when it is too uncertain to state. */
export const lengthText = (q: Q | null, unit: Unit, basis: string) =>
  q ? shortReading(readingText(lengthOf(q, unit, basis))) : "not measured";

/** True when the mean height's bar is as large as the height: walls drawn at
 * that height would look measured and are not. */
export const heightUncertain = (n: Numbers): boolean =>
  !!n.meanHeight && tooUncertain(lengthOf(n.meanHeight, "mm", ""));

/** Why there is no height to show, or null when there is one. */
export function heightReason(n: Numbers, hasTop: boolean, focal: boolean) {
  if (n.meanHeight) return null;
  if (!hasTop) return NO_CEILING;
  if (!focal) return NO_FOCAL;
  return n.shell.meanHeight !== null ? UNSTABLE : NOT_ABOVE;
}

/** The one-line instruction for where the tool stands. */
export function liveStep({ corners, closed, pick }: WallsState): string {
  const n = corners.length;
  if (!closed) {
    if (!n)
      return "Tap the floor corners of the room in order, or press Use last outline.";
    if (n < 3)
      return `${n} floor corner${n === 1 ? "" : "s"} placed. Tap at least ${3 - n} more.`;
    return `${n} floor corners placed. Tap more, or press Close room.`;
  }
  if (pick !== null)
    return `Tap where the wall edge above corner ${pick + 1} meets the ceiling.`;
  return "Drag any point to adjust it. To set a ceiling point again, choose its corner first.";
}
