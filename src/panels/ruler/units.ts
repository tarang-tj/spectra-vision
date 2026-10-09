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
