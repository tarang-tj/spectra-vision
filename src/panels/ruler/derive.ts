/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Everything the panel and the overlay show, computed from the store's state.
import { formatMeasured } from "../../measure/format";
import { shapeRows, type ShapeRow } from "./derive-shapes";
import { applyLens, fitRadial, lensFor, type Lens, type LensFit } from "./lens";
import {
  degenerateReason,
  orderCorners,
  quadArea,
  solveSheet,
  type Sheet,
} from "./homography";
import {
  basisFor,
  measureSpan,
  TAP_SIGMA_SCREEN_PX,
  type Span,
} from "./monte-carlo";
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
  /** Tap indices of the corners in `sheet.ordered` order. */
  order: number[];
  rows: Row[];
  /** Finished paths and outlines. */
  shapes: ShapeRow[];
  /** The fit from the tapped straight edges, or null with fewer than two. */
  lensFit: LensFit | null;
  /** The correction actually applied (asked for and improving), or null. */
  lens: Lens | null;
  /** What the error bar covers for these results. */
  basis: string;
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

/** While a handle is dragged, the long side is held to the edge it had at the
 * start (as tap indices), so the guess cannot flip mid-drag. */
function lockedFirstIsLong(
  lock: readonly [number, number] | null,
  order: number[],
): boolean | undefined {
  if (!lock) return undefined;
  const i = order.indexOf(lock[0]),
    j = order.indexOf(lock[1]);
  if (i < 0 || j < 0) return undefined;
  const lo = Math.min(i, j),
    hi = Math.max(i, j);
  if (hi - lo === 1 || (lo === 0 && hi === 3))
    return lo === 0 && hi === 1 ? true : lo === 2 && hi === 3 ? true : false;
  return undefined;
}

/** The long edge of the current sheet as tap indices, to lock during a drag. */
export function longEdge(d: Derived): [number, number] | null {
  if (!d.sheet || d.order.length !== 4) return null;
  return d.sheet.firstIsLong
    ? [d.order[0], d.order[1]]
    : [d.order[1], d.order[2]];
}

let memo: { state: RulerState; value: Derived } | null = null;

export function derive(s: RulerState): Derived {
  if (memo && memo.state === s) return memo.value;
  const reference = referenceOf(s);
  let problem: string | null = null,
    sheet: Sheet | null = null,
    order: number[] = [];
  const referenceWarnings: string[] = [],
    edges = s.shapes
      .filter((x) => x.kind === "edge" && x.done)
      .map((x) => x.pts),
    lensFit = s.source ? fitRadial(edges, s.source.w, s.source.h) : null,
    lens =
      s.lensOn && lensFit?.improved && s.source
        ? lensFor(lensFit.k, s.source.w, s.source.h)
        : null,
    basis = basisFor(lens);
  if (!reference) problem = "Enter both sides of the custom reference in mm.";
  else if (s.corners.length === 4) {
    // Tap order is raw; the solve uses the corners after any lens correction.
    const rawOrdered = orderCorners(s.corners),
      ordered = rawOrdered.map((p) => applyLens(lens, p)),
      bad = degenerateReason(ordered);
    if (bad) problem = `The four corners cannot be used: ${bad}.`;
    else {
      order = rawOrdered.map((p) => s.corners.indexOf(p));
      sheet = solveSheet(
        ordered,
        reference.long,
        reference.short,
        s.swap,
        lockedFirstIsLong(s.lock, order),
      );
      if (!sheet) problem = "The four corners do not define a flat surface.";
      else sheet = { ...sheet, raw: rawOrdered };
    }
    if (s.source && !bad) {
      const share = quadArea(rawOrdered) / (s.source.w * s.source.h);
      if (share < MIN_COVER)
        referenceWarnings.push(
          `The reference covers ${(share * 100).toFixed(1)}% of the image, under 2%. A bigger reference, or a closer photo, gives a tighter result.`,
        );
    }
  }
  // Only for points placed before their own uncertainty was stored.
  const sigma = TAP_SIGMA_SCREEN_PX / (s.scale > 0 ? s.scale : 1),
    rows: Row[] = [];
  s.measures.forEach((m, index) => {
    if (!m.b || !sheet || !reference) return;
    const span = measureSpan(
        sheet,
        m.a,
        m.b,
        sigma,
        s.unit,
        undefined,
        undefined,
        lens,
      ),
      warnings: string[] = [];
    if (span && span.mm > FAR * reference.long)
      warnings.push(
        "This span is more than 10 times the reference's long side. Small errors in the reference grow with distance, so trust it less than the bar suggests.",
      );
    if (!span)
      warnings.push(
        "Not measured: a point is at or beyond the horizon of the surface, or the reference is too small for a span this far away. Tap points on the reference's surface, or use a bigger reference.",
      );
    rows.push({
      index,
      span,
      text: span ? formatMeasured(span.measured) : "not measured",
      warnings,
    });
  });
  const shapes = reference
    ? shapeRows(
        s.shapes,
        sheet,
        reference.long,
        sigma,
        s.unit,
        lens,
        basis,
        FAR,
      )
    : [];
  const value = {
    reference,
    problem,
    sheet,
    order,
    rows,
    shapes,
    lensFit,
    lens,
    basis,
    referenceWarnings,
  };
  memo = { state: s, value };
  return value;
}

/** Plain-text results for the clipboard. Nothing is uploaded. */
export function resultsText(s: RulerState, d: Derived): string {
  if (!d.reference || (!d.rows.length && !d.shapes.length)) return "";
  const ref = d.reference,
    lines: string[] = [];
  lines.push(`Reference: ${ref.label}, ${ref.long} x ${ref.short} mm`);
  d.rows.forEach((r) => lines.push(`Measurement ${r.index + 1}: ${r.text}`));
  d.shapes.forEach((r) => {
    if (r.areaText) lines.push(`${r.label} area: ${r.areaText}`);
    if (r.areaAltText) lines.push(`${r.label} area: ${r.areaAltText}`);
    lines.push(
      `${r.label} ${r.kind === "area" ? "perimeter" : "length"}: ${r.lengthText}`,
    );
    r.legTexts.forEach((t, i) => lines.push(`${r.label} leg ${i + 1}: ${t}`));
  });
  lines.push(`Error bar: 2 standard deviations. ${d.basis}`);
  if (s.swap) lines.push("Reference sides were swapped by hand.");
  return lines.join("\n");
}
