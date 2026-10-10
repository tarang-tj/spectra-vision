/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Does the box fit? For each finished outline: the room between the box's
// footprint and the outline, with a bar from the same simulated retakes the
// Ruler's camera uses. For each finished span: whether the box's width and
// depth pass through a gap of that length, using the span's own bar.
import { formatMeasured } from "../../../measure/format";
import { measured, type Measured } from "../../../measure/noise";
import { cameraTrials, tapSigma, type Trial } from "../camera-of";
import type { Derived } from "../derive";
import { applyHomography, type Pt } from "../homography";
import {
  droppedNote,
  gaussian,
  makeJitter,
  seededRandom,
} from "../monte-carlo";
import { plumbVersion } from "../plumbs";
import type { RulerState, Shape } from "../state";
import { fromMm, type Unit } from "../units";
import type { BoxState } from "./box-state";
import { clearance, footprintCorners, sampleSd, type P } from "./geometry";

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
    close: "Too close to call for the width: % to spare",
  },
  depth: {
    fits: "Depth passes, with % to spare",
    over: "Depth does not pass: over by %",
    close: "Too close to call for the depth: % to spare",
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
    text: WORDS[what][kind].replace("%", formatMeasured(m)),
  };
}

/** What the outline verdict's bar covers, word for word. */
export const basisOf = (d: Derived, trials: number): string =>
  `The bar is 2 standard deviations of the clearance over ${trials} simulated retakes of the taps on the reference and on the outline${d.lens ? ", after a one-parameter lens correction" : ""}. Not included: where the box stands and the sizes typed for it, which are taken as exact; lens distortion; a floor that is not flat; a bent or misprinted reference. Only the footprint is checked, not the height.`;

// The outline's corners on the plane in every trial. Kept per shape, so
// moving the box does not redo them.
type Scatter = { trials: readonly Trial[]; planes: (P[] | null)[] };
const scatterMemo = new WeakMap<Shape, Scatter>();

function scatter(
  shape: Shape,
  trials: readonly Trial[],
  s: RulerState,
  d: Derived,
): Scatter {
  const hit = scatterMemo.get(shape);
  if (hit && hit.trials === trials) return hit;
  const sigma = tapSigma(s),
    planes = trials.map((trial) => {
      // The trial's own seed, so each retake moves the outline's taps too.
      const jitter = makeJitter(
          gaussian(seededRandom(trial.seed)),
          sigma,
          d.lens,
        ),
        out: P[] = [];
      for (const tap of shape.pts) {
        const q = applyHomography(trial.h, jitter(tap));
        if (!q) return null;
        out.push(q);
      }
      return out;
    }),
    value = { trials, planes };
  scatterMemo.set(shape, value);
  return value;
}

/** Clearance of the footprint inside one outline, with its bar. Null when
 * too few simulated retakes kept the outline in front of the horizon. */
export function outlineClearance(
  foot: readonly P[],
  nominal: readonly Pt[],
  shape: Shape,
  s: RulerState,
  d: Derived,
): { mm: number; errorMm: number; kept: number; trials: number } | null {
  const { trials, kept } = cameraTrials(s, d);
  if (!trials.length) return null;
  const values: number[] = [];
  for (const plane of scatter(shape, trials, s, d).planes)
    if (plane) {
      const c = clearance(foot, plane);
      if (Number.isFinite(c)) values.push(c);
    }
  const share = (values.length / trials.length) * kept,
    mm = clearance(foot, nominal);
  if (share < 0.8 || !Number.isFinite(mm)) return null;
  return {
    mm,
    errorMm: 2 * sampleSd(values),
    kept: share,
    trials: values.length,
  };
}

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
