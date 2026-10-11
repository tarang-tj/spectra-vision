/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// How the Ruler, Box and Walls word a size: a length, height, area, volume or
// clearance. A size whose bar is as large as the size itself says nothing as
// "value ± bar" ("0 ± 2000 cm"), so it is said in words with the bar and what
// would narrow it. Display text only: the numbers behind it are untouched.
// Not for the shared formatter: elsewhere a true value of zero with a bar
// (an angle, a share) is a real reading.
import { formatMeasured, roundError } from "../../measure/format";
import type { Measured } from "../../measure/noise";

/** What narrows a bar that is too wide. */
export const FIX = "Add a larger or second reference, or a known span.";
const LEAD = "too uncertain to state (bar ";

/** True when the bar is as large as the size or larger. Judged on the numbers
 * as measured, not as rounded, so it is the same line the Box verdict draws
 * between "fits" and "too close to call". */
export const tooUncertain = (m: Measured): boolean =>
  Number.isFinite(m.value) &&
  Number.isFinite(m.error) &&
  m.error > 0 &&
  m.error >= Math.abs(m.value);

/** "± 180 m": the bar alone, rounded as the shared formatter rounds it. */
export function barText(m: Measured): string {
  const { error, decimals } = roundError(m.error);
  return `± ${error.toFixed(Math.max(0, decimals))}${m.unit ? ` ${m.unit}` : ""}`;
}

/** "4.20 ± 0.13 m", or one line saying the size is too uncertain to state,
 * with its bar and what would fix it. */
export const readingText = (m: Measured): string =>
  tooUncertain(m) ? `${LEAD}${barText(m)}). ${FIX}` : formatMeasured(m);

/** True for a text made by readingText for a size that is too uncertain. */
export const isUncertainText = (text: string): boolean => text.startsWith(LEAD);

/** True for the short form shortReading gives such a text. */
export const isUncertainShort = (text: string): boolean =>
  text.startsWith("too uncertain (");

/** The same reading for a tight spot (a stage label, a table cell, the middle
 * of a sentence): "too uncertain (± 180 m)", with the advice left out. Any
 * other text is returned as it is. */
export const shortReading = (text: string): string =>
  isUncertainText(text)
    ? `too uncertain (${text.slice(LEAD.length, text.indexOf(")"))})`
    : text;
