/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Columns of the mode switch on a narrow screen. Up to four modes sit in one
 * row; more are split into two balanced rows (5 as 3+2, 6 as 3+3, 7 as 4+3)
 * so every button stays wide enough for its label and at least 40 px tall. */
export function modeColumns(count: number): number {
  if (count <= 4) return Math.max(1, count);
  return Math.min(4, Math.ceil(count / 2));
}
