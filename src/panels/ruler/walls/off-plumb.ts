/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Is a ceiling point above the corner it was given to? Each base and ceiling
// pair is itself a plumb edge in the camera fit, so a wrong one bends the
// camera toward itself. To judge a pair fairly the camera is fitted again
// without it, and the point is compared with the plumb line that camera draws
// through the corner.
import { fitCamera, heightAbove, type Camera } from "../../../measure/camera";
import { tapSigma } from "../camera-of";
import type { Derived } from "../derive";
import { applyHomography, type Pt } from "../homography";
import { applyLens } from "../lens";
import { allPlumbs } from "../plumbs";
import type { RulerState } from "../state";
import type { Corner } from "./store";

/** A ceiling point this many tap uncertainties off its plumb line is flagged. */
export const OFF_SIGMAS = 8;

/** Indices of the corners whose ceiling point is not above them. The pair
 * whose removal lets the rest agree best is judged first and, if flagged, is
 * left out of every later fit, so one wrong point does not make its
 * neighbours look wrong too. */
export function offPlumb(
  s: RulerState,
  d: Derived,
  camera: Camera | null,
  corners: readonly Corner[],
): number[] {
  const { sheet, lens } = d,
    out: number[] = [];
  if (!sheet || !s.source || !camera) return out;
  const { w: width, h: height } = s.source,
    seen = sheet.ordered.map((image, i) => ({ plane: sheet.plane[i], image })),
    mine = corners.flatMap((c, i) =>
      c.top ? [{ i, a: c.base, b: c.top }] : [],
    ),
    others = allPlumbs().filter(
      (l) => !mine.some((m) => m.a === l.a && m.b === l.b),
    ),
    flat = (l: { a: Pt; b: Pt }) => ({
      a: applyLens(lens, l.a),
      b: applyLens(lens, l.b),
    });
  let left = mine;
  while (left.length) {
    let odd: { i: number; over: number; rms: number } | null = null;
    for (const pair of left) {
      const without = fitCamera({
          h: sheet.h,
          width,
          height,
          seen,
          plumbs: [...others, ...left.filter((l) => l !== pair)].map(flat),
          near: camera,
        }),
        floor = applyHomography(sheet.h, applyLens(lens, pair.a)),
        got =
          without?.focalResolved && floor
            ? heightAbove(without, floor, applyLens(lens, pair.b))
            : null,
        over = got ? got.off / (OFF_SIGMAS * (pair.b.s ?? tapSigma(s))) : 0;
      if (without && (!odd || without.rms < odd.rms))
        odd = { i: pair.i, over, rms: without.rms };
    }
    if (!odd || odd.over <= 1) break;
    const gone = odd.i;
    out.push(gone);
    left = left.filter((l) => l.i !== gone);
  }
  return out.sort((a, b) => a - b);
}
