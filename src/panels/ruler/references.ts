/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The things a person can lay on the surface as a known size.

export type Reference = {
  id: string;
  label: string;
  /** Sides in millimetres; `long` is the longer one. */
  long: number;
  short: number;
};

export const REFERENCES: readonly Reference[] = [
  { id: "letter", label: "US Letter", long: 279.4, short: 215.9 },
  { id: "a4", label: "A4", long: 297, short: 210 },
  { id: "card", label: "Bank card", long: 85.6, short: 53.98 },
];

/** Largest custom side accepted, in mm: a sheet bigger than 10 m is a typo. */
export const MAX_CUSTOM_MM = 10_000;

/** A custom reference from two sides in mm, or null when either is not a
 * positive, finite, sane size. */
export function customReference(a: number, b: number): Reference | null {
  const ok = (v: number) => Number.isFinite(v) && v > 0 && v <= MAX_CUSTOM_MM;
  if (!ok(a) || !ok(b)) return null;
  return {
    id: "custom",
    label: "Custom",
    long: Math.max(a, b),
    short: Math.min(a, b),
  };
}
