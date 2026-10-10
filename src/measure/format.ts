/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Measured } from "./noise";

/** An error rounded for display, and the number of decimal places that leaves
 * (negative when it rounds to tens or hundreds). Two significant figures when
 * the leading digit is 1 or 2, one otherwise: a bar of 1.2 cut to "1" would be
 * off by a fifth, while 7.2 cut to "7" loses little. The leading digit is read
 * before rounding, so 0.96 becomes 1 (one figure) and 2.96 becomes 3.0. */
export function roundError(error: number): { error: number; decimals: number } {
  // The decimal text avoids the floating point slips of log10 and division.
  const figures = Number(error.toExponential(10)[0]) <= 2 ? 2 : 1,
    text = error.toExponential(figures - 1),
    exponent = Number(text.slice(text.indexOf("e") + 1));
  return { error: Number(text), decimals: figures - 1 - exponent };
}

/** `value` to `decimals` places as text; negative places round to tens, hundreds. */
function fixed(value: number, decimals: number): string {
  const text =
    decimals >= 0
      ? value.toFixed(Math.min(20, decimals))
      : String(Math.round(value / 10 ** -decimals) * 10 ** -decimals);
  // A small negative number must not print as "-0.0".
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

// These units sit against the number: "12 °" and "40 %" would read oddly.
const ATTACHED = new Set(["°", "%"]);

/** "12.3 ± 0.4 cm", "2.4 ± 1.2 m": the error to one significant figure, or two
 * when it starts with 1 or 2 (see roundError), the value to the same decimal
 * place. An error of exactly 0 is written "± 0" with the value to three
 * figures. A missing or negative error, or a missing value, is "not measured",
 * because a number with no stated error is not shown. */
export function formatMeasured(m: Measured): string {
  if (!Number.isFinite(m.value) || !Number.isFinite(m.error) || m.error < 0)
    return "not measured";
  const unit = !m.unit ? "" : ATTACHED.has(m.unit) ? m.unit : ` ${m.unit}`;
  if (m.error === 0) return `${Number(m.value.toPrecision(3))} ± 0${unit}`;
  const { error, decimals } = roundError(m.error);
  return `${fixed(m.value, decimals)} ± ${fixed(error, decimals)}${unit}`;
}
