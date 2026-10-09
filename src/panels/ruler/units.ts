/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Units the Ruler can show. Everything is computed in millimetres.

export type Unit = "mm" | "cm" | "m" | "in" | "ft";
export const UNITS: readonly Unit[] = ["mm", "cm", "m", "in", "ft"];
const MM_PER: Record<Unit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

export const fromMm = (mm: number, unit: Unit): number => mm / MM_PER[unit];
export const toMm = (value: number, unit: Unit): number => value * MM_PER[unit];
export const isUnit = (value: unknown): value is Unit =>
  typeof value === "string" && (UNITS as readonly string[]).includes(value);

/** Square millimetres to the chosen unit squared. */
export const areaFromMm2 = (mm2: number, unit: Unit): number =>
  mm2 / MM_PER[unit] ** 2;
/** Label for an area in `unit`, e.g. "cm²". */
export const areaUnit = (unit: Unit): string => `${unit}²`;
/** The larger everyday area unit that fits the chosen length unit: square
 * metres for metric units, square feet for inches and feet. */
export const bigAreaUnit = (unit: Unit): Unit =>
  unit === "in" || unit === "ft" ? "ft" : "m";
