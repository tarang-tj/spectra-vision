/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Everything the panel and the overlay show, computed from the store's state.
import { formatMeasured } from "../../measure/format";
import {
  degenerateReason,
  orderCorners,
  quadArea,
  solveSheet,
  type Sheet,
} from "./homography";
import { measureSpan, TAP_SIGMA_SCREEN_PX, type Span } from "./monte-carlo";
import { customReference, REFERENCES, type Reference } from "./references";
import type { RulerState } from "./store";

export type Row = {
  index: number;
  span: Span | null;
  text: string;
  warnings: string[];
};
export type Derived = {
  reference: Reference | null;
  /** Why the reference cannot be used yet, or null. */
  problem: string | null;
  sheet: Sheet | null;
  rows: Row[];
  /** Warnings about the reference itself. */
  referenceWarnings: string[];
};

const FAR = 10;
const MIN_COVER = 0.02;

export function referenceOf(s: RulerState): Reference | null {
  if (s.refId !== "custom")
    return REFERENCES.find((r) => r.id === s.refId) ?? null;
  // Custom sides are typed in millimetres.
  return customReference(Number(s.customA), Number(s.customB));
}

let memo: { state: RulerState; value: Derived } | null = null;

export function derive(s: RulerState): Derived {
  if (memo && memo.state === s) return memo.value;
  const reference = referenceOf(s);
  let problem: string | null = null,
    sheet: Sheet | null = null;
  const referenceWarnings: string[] = [];
  if (!reference) problem = "Enter both sides of the custom reference in mm.";
  else if (s.corners.length === 4) {
    const ordered = orderCorners(s.corners),
      bad = degenerateReason(ordered);
    if (bad) problem = `The four corners cannot be used: ${bad}.`;
    else {
      sheet = solveSheet(ordered, reference.long, reference.short, s.swap);
      if (!sheet) problem = "The four corners do not define a flat surface.";
    }
    if (s.source && !bad) {
      const share = quadArea(ordered) / (s.source.w * s.source.h);
      if (share < MIN_COVER)
        referenceWarnings.push(
          `The reference covers ${(share * 100).toFixed(1)}% of the image, under 2%. A bigger reference, or a closer photo, gives a tighter result.`,
        );
    }
  }
  const sigma = TAP_SIGMA_SCREEN_PX / (s.scale > 0 ? s.scale : 1),
    rows: Row[] = [];
  s.measures.forEach((m, index) => {
    if (!m.b || !sheet || !reference) return;
    const span = measureSpan(sheet, m.a, m.b, sigma, s.unit),
      warnings: string[] = [];
    if (span && span.mm > FAR * reference.long)
      warnings.push(
        "This span is more than 10 times the reference's long side. Small errors in the reference grow with distance, so trust it less than the bar suggests.",
      );
    rows.push({
      index,
      span,
      text: span ? formatMeasured(span.measured) : "not measured",
      warnings,
    });
  });
  const value = { reference, problem, sheet, rows, referenceWarnings };
  memo = { state: s, value };
  return value;
}

/** Plain-text results for the clipboard. Nothing is uploaded. */
export function resultsText(s: RulerState, d: Derived, basis: string): string {
  if (!d.reference || !d.rows.length) return "";
  const ref = d.reference,
    lines: string[] = [];
  lines.push(`Reference: ${ref.label}, ${ref.long} x ${ref.short} mm`);
  d.rows.forEach((r) => lines.push(`Measurement ${r.index + 1}: ${r.text}`));
  lines.push(`Error bar: 2 standard deviations. ${basis}`);
  if (s.swap) lines.push("Reference sides were swapped by hand.");
  return lines.join("\n");
}
