/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Does the box fit? For each finished outline: the room between the box's
// footprint and the outline, with a bar from the same simulated retakes the
// Ruler's camera uses. For each finished span: whether the box's width and
// depth pass through a gap of that length, using the span's own bar.
import { measured, type Measured } from "../../../measure/noise";
import type { Derived } from "../derive";
import { basisFor, droppedNote } from "../monte-carlo";
import { plumbVersion } from "../plumbs";
import { readingText } from "../reading";
import type { RulerState } from "../state";
import { fromMm, type Unit } from "../units";
import type { BoxState } from "./box-state";
import { footprintCorners } from "./geometry";
import { outlineClearance } from "./outline-trials";

export type Kind = "fits" | "over" | "close";

/** The three-way rule. `mm` is the room to spare (negative: too big by that
 * much) and `barMm` its bar. A verdict is given only when the whole bar is on
 * one side of zero. */
export const threeWay = (mm: number, barMm: number): Kind =>
  mm - barMm > 0 ? "fits" : mm + barMm < 0 ? "over" : "close";

export type Verdict = {
  kind: Kind;
  /** Room to spare and its bar (2 sd), mm. */
  mm: number;
  errorMm: number;
  /** The same in the chosen unit, positive for both "fits" and "over". */
  measured: Measured;
  text: string;
};
export type Row = {
  label: string;
  /** One verdict for an outline; width then depth for a span. */
  verdicts: Verdict[];
  /** Why there is no verdict, when there is none. */
  reason: string | null;
  warnings: string[];
};

const WORDS: Record<"outline" | "width" | "depth", Record<Kind, string>> = {
  outline: {
    fits: "Fits, with % of clearance",
    over: "Does not fit: over by %",
    close: "Too close to call: clearance %",
  },
  width: {
    fits: "Width passes, with % to spare",
    over: "Width does not pass: over by %",
    close: "Too close to call for the width: room to spare %",
  },
  depth: {
    fits: "Depth passes, with % to spare",
    over: "Depth does not pass: over by %",
    close: "Too close to call for the depth: room to spare %",
  },
};

export function verdictOf(
  what: keyof typeof WORDS,
  mm: number,
  errorMm: number,
  unit: Unit,
  basis: string,
): Verdict {
  const kind = threeWay(mm, errorMm),
    m = measured(
      fromMm(kind === "over" ? 0 - mm : mm, unit),
      fromMm(errorMm, unit),
      unit,
      basis,
    );
  return {
    kind,
    mm,
    errorMm,
    measured: m,
    // "Too close to call" is exactly a bar as large as the room to spare, so
    // its number is said the way every such size is (reading.ts).
    text: WORDS[what][kind].replace("%", readingText(m)),
  };
}

/** Measured, not assumed: how many times in 100 the bar held the true
 * clearance over 200 noisy retakes of one scene, with one reference
 * (tests/fit-scene.test.ts) and with a second one (tests/fit-fused.test.ts).
 * Those tests fail if a figure drifts from what they observe. */
export const FIT_COVERAGE = { nearWall: 98, centred: 91, centredSecond: 86 };
const HELD =
    "over 200 simulated retakes of one test scene: this bar held the true clearance",
  UNDER =
    "fewer than the 95 that 2 standard deviations suggest. So a verdict can be wrong.";
const coverageNote = (fused: { rects: number } | null | undefined): string =>
  !fused
    ? ` Measured with one reference, ${HELD} ${FIT_COVERAGE.nearWall} times in 100 with the box 40 mm from one wall, and ${FIT_COVERAGE.centred} times in 100 with it 50 mm from all four sides, ${UNDER}`
    : fused.rects
      ? ` Measured with a second reference in view, ${HELD} ${FIT_COVERAGE.centredSecond} times in 100 with the box 50 mm from all four sides, ${UNDER}`
      : " How often this bar holds the true clearance was not measured with one reference and known spans only.";

/** What the outline verdict's bar covers, word for word. The retakes are the
 * Ruler's own (camera-of.ts), so the middle of the sentence is the Ruler's:
 * with further references or known spans fused in, it names their corners,
 * their ends and the tape uncertainty too. */
export const basisOf = (d: Derived, trials: number): string =>
  `The bar is 2 standard deviations of the clearance over ${trials} simulated retakes. Each retake moves the taps on the outline and redoes the Ruler's solve of the floor, whose own basis is: ${basisFor(d.lens, d.sheet?.fused)} Also not included: where the box stands and the sizes typed for it, which are taken as exact; a floor that is not flat. Only the footprint is checked, not the height.${coverageNote(d.sheet?.fused)}`;

let memo: {
  s: RulerState;
  box: BoxState;
  plumbs: number;
  value: { rows: Row[]; basis: string | null };
} | null = null;

/** Every verdict for the placed box. Empty until it is placed and the
 * reference is solved. Memoized on the state objects, so a render that
 * changed nothing does not run the retakes again. */
export function verdicts(
  s: RulerState,
  d: Derived,
  box: BoxState,
): { rows: Row[]; basis: string | null } {
  // Plumb edges change the retakes without changing the Ruler's state.
  const plumbs = plumbVersion();
  if (memo && memo.s === s && memo.box === box && memo.plumbs === plumbs)
    return memo.value;
  const rows: Row[] = [];
  let basis: string | null = null;
  if (box.at && d.sheet) {
    const foot = footprintCorners({ ...box, ...box.at });
    for (const r of d.shapes) {
      if (r.kind !== "area") continue;
      const row: Row = {
        label: r.label,
        verdicts: [],
        reason: null,
        warnings: [],
      };
      rows.push(row);
      if (!r.result)
        row.reason =
          "Not measured: a corner of this outline is at or beyond the horizon of the surface.";
      else if (r.result.selfIntersecting)
        row.reason =
          "Not measured: this outline crosses itself, so it has no inside.";
      else {
        const c = outlineClearance(
          foot,
          r.result.plane,
          s.shapes[r.shape],
          s,
          d,
        );
        if (!c)
          row.reason =
            "Not measured: too few simulated retakes kept this outline in front of the horizon, so there is no honest bar.";
        else {
          basis = basisOf(d, c.trials);
          row.verdicts.push(
            verdictOf("outline", c.mm, c.errorMm, s.unit, basis),
          );
          if (c.kept < 1) row.warnings.push(droppedNote(c.kept));
        }
      }
    }
    for (const r of d.rows) {
      const row: Row = {
        label: `Measurement ${r.index + 1}`,
        verdicts: [],
        reason: null,
        warnings: [],
      };
      rows.push(row);
      if (!r.span)
        row.reason = "Not measured: this span itself could not be measured.";
      else
        for (const side of ["width", "depth"] as const)
          row.verdicts.push(
            verdictOf(
              side,
              r.span.mm - (side === "width" ? box.w : box.d),
              r.span.errorMm,
              s.unit,
              r.span.measured.basis,
            ),
          );
    }
  }
  const value = { rows, basis };
  memo = { s, box, plumbs, value };
  return value;
}
