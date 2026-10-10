/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The further known sizes as the panel shows them: which went into the fused
// solve and why any did not, and the tape test (typed tape readings set
// against the measured spans).
import { roundError } from "../../measure/format";
import { fuseSheet } from "./fuse-inputs";
import type { Sheet } from "./homography";
import type { Lens } from "./lens";
import type { Span } from "./monte-carlo";
import type { Measure, RulerState } from "./state";
import { fromMm, toMm } from "./units";

export const DEFAULT_TAPE_SD_MM = 2;
/** Longest typed length accepted, in mm: more than 100 m is a typo. */
export const MAX_TAPE_MM = 100_000;

/** The typed tape reading of a span in mm, or null when it is not a positive,
 * finite, sane length. */
export function tapeMm(m: Measure, s: RulerState): number | null {
  const text = (m.tape ?? "").trim(),
    mm = text ? toMm(Number(text), m.tapeUnit ?? s.unit) : NaN;
  return Number.isFinite(mm) && mm > 0 && mm <= MAX_TAPE_MM ? mm : null;
}

/** The tape uncertainty (one sd, mm), and a message when what was typed
 * cannot be used and the default stands in. */
export function tapeSd(s: RulerState): { mm: number; problem: string | null } {
  const v = s.tapeSd.trim() === "" ? NaN : Number(s.tapeSd);
  return Number.isFinite(v) && v >= 0 && v <= 100
    ? { mm: v, problem: null }
    : {
        mm: DEFAULT_TAPE_SD_MM,
        problem: `The tape uncertainty must be a number from 0 to 100 mm. ${DEFAULT_TAPE_SD_MM} mm is used.`,
      };
}

export type KnownSizes = {
  sheet: Sheet;
  /** One per further reference: a status line, and whether it is a warning. */
  refs: { text: string; warn: boolean }[];
  /** Messages about known spans that could not be used, and about the fused
   * solve as a whole. */
  warnings: string[];
  /** Which measures went in as known spans. */
  knownUsed: Set<number>;
  /** What the solve used, in words; null with the first reference alone. */
  summary: string | null;
  tapeSdMm: number;
  tapeSdProblem: string | null;
};

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function knownSizes(
  s: RulerState,
  first: Sheet,
  lens: Lens | null,
  sigma: number,
): KnownSizes {
  const sd = tapeSd(s),
    at: number[] = [];
  s.measures.forEach((m, i) => {
    if (m.known && m.b) at.push(i);
  });
  const f = fuseSheet(
      first,
      lens,
      s.extraRefs,
      at.map((i) => ({
        a: s.measures[i].a,
        b: s.measures[i].b!,
        mm: tapeMm(s.measures[i], s),
      })),
      sigma,
      sd.mm,
    ),
    warnings: string[] = [],
    knownUsed = new Set<number>();
  f.spans.forEach((u, k) => {
    if (u.used) knownUsed.add(at[k]);
    else if (u.why)
      warnings.push(
        `Measurement ${at[k] + 1} is not used as a known span: ${u.why}`,
      );
  });
  if (f.note) warnings.push(f.note);
  const fused = f.sheet.fused;
  return {
    sheet: f.sheet,
    refs: s.extraRefs.map((r, i) => {
      const u = f.rects[i],
        name = `Reference ${i + 2} (${r.label}, ${r.long} x ${r.short} mm)`;
      if (u.used) return { text: `${name}: used.`, warn: false };
      if (!u.why)
        return {
          text: `${name}: ${count(4 - r.corners.length, "corner")} still to tap.`,
          warn: false,
        };
      return { text: `${name} is not used: ${u.why}`, warn: true };
    }),
    warnings,
    knownUsed,
    summary: fused
      ? `One surface solved from ${count(fused.rects + 1, "reference")}${fused.spans ? ` and ${count(fused.spans, "known span")}` : ""} together.`
      : null,
    tapeSdMm: sd.mm,
    tapeSdProblem: sd.problem,
  };
}

export type TapeCheck = {
  /** Index into the state's measures. */
  index: number;
  reading: string;
  tape: string;
  difference: string;
  /** Null when there is nothing to compare (not measured, bad typing) or the
   * span is itself a known size. */
  inside: boolean | null;
  verdict: string;
};
export type TapeTest = { checks: TapeCheck[]; tally: string | null };

/** Every span with something typed in its tape box, set against its reading.
 * A check, never a correction: a span used as a known size is listed but not
 * counted, because its reading was pulled to the tape. */
export function tapeTest(
  s: RulerState,
  rows: { index: number; span: Span | null; text: string }[],
  knownUsed: Set<number>,
): TapeTest {
  const checks: TapeCheck[] = [];
  let inside = 0,
    total = 0;
  for (const r of rows) {
    const m = s.measures[r.index];
    if (!m || !(m.tape ?? "").trim()) continue;
    const mm = tapeMm(m, s),
      base = { index: r.index, reading: r.text, tape: "", difference: "" };
    if (mm === null) {
      checks.push({
        ...base,
        inside: null,
        verdict: "Type the tape reading as a number greater than zero.",
      });
      continue;
    }
    const tape = `${Number(fromMm(mm, s.unit).toPrecision(6))} ${s.unit}`;
    if (!r.span) {
      checks.push({ ...base, tape, inside: null, verdict: "not measured" });
      continue;
    }
    const diff = fromMm(r.span.mm - mm, s.unit),
      bar = fromMm(r.span.errorMm, s.unit),
      // One more place than the bar is written to, so a small difference
      // does not read as nothing.
      places = bar > 0 ? Math.max(0, roundError(bar).decimals + 1) : 2,
      size = Math.abs(diff).toFixed(Math.min(places, 6)),
      difference = `${Number(size) === 0 ? "" : diff > 0 ? "+" : "-"}${size} ${s.unit}`;
    if (knownUsed.has(r.index)) {
      checks.push({
        ...base,
        tape,
        difference,
        inside: null,
        verdict: "used as a known span, so not a check",
      });
      continue;
    }
    const ok = Math.abs(r.span.mm - mm) <= r.span.errorMm;
    total++;
    if (ok) inside++;
    checks.push({
      ...base,
      tape,
      difference,
      inside: ok,
      verdict: ok ? "inside the bar" : "outside the bar",
    });
  }
  return {
    checks,
    tally: total
      ? total === 1
        ? `${inside} of 1 tape value inside its bar`
        : `${inside} of ${total} tape values inside their bars`
      : null,
  };
}
