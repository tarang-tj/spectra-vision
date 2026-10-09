/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe } from "./series";

/** A measured number. `error` is one stated uncertainty in the same unit as
 * `value`, and `basis` says in plain words what that error covers (and, when it
 * matters, what it leaves out). A number without a basis is not a measurement. */
export type Measured = {
  value: number;
  error: number;
  unit: string;
  basis: string;
};

export const measured = (
  value: number,
  error: number,
  unit: string,
  basis: string,
): Measured => ({ value, error, unit, basis });

/** True when both the value and its error are real numbers. A metric whose
 * inputs were never seen is NaN and must be shown as "not seen", never as 0. */
export const isMeasured = (m: Measured): boolean =>
  Number.isFinite(m.value) && Number.isFinite(m.error) && m.error >= 0;

/** Independent errors added in quadrature. NaN if any of them is not a number. */
export const combineErrors = (...errors: number[]): number =>
  Math.sqrt(errors.reduce((sum, e) => sum + e * e, 0));

export type NoiseFloor = {
  /** Samples used. */
  count: number;
  /** Sample standard deviation of the interval. */
  sd: number;
  /** Largest minus smallest value of the interval. */
  peakToPeak: number;
};

/** The noise floor of a signal from an interval in which the thing measured
 * was held still: whatever the signal does there is noise (or drift), not
 * movement. Needs at least two finite samples; fewer give NaN, not zero. */
export function noiseFloor(still: ArrayLike<number>): NoiseFloor {
  const s = describe(still);
  return s.count < 2
    ? { count: s.count, sd: NaN, peakToPeak: NaN }
    : { count: s.count, sd: s.sd, peakToPeak: s.max - s.min };
}
