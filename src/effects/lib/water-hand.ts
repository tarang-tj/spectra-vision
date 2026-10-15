/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Rect } from "../../vision/frame";
import type { Point } from "../../vision/types";

/** One measured palm, in stage CSS pixels. `t` is the model result's time
 * in ms, `spread` the mean fingertip to wrist distance over `size`, used to
 * pick a hand. */
export type HandSample = {
  x: number;
  y: number;
  size: number;
  open: boolean;
  t: number;
  spread: number;
};

export const OPEN_ABOVE = 1.55,
  CLOSED_BELOW = 1.3,
  /** Thumb tip to index tip, over `size`. Below this the hand is pinching
   * (an OK sign spreads its other fingers wide), so it does not count. */
  PINCH_BELOW = 0.3;
const TIPS = [4, 8, 12, 16, 20],
  PALM = [0, 5, 9, 13, 17];

export const handSample = (): HandSample => {
  return { x: 0, y: 0, size: 0, open: false, t: 0, spread: 0 };
};

/** Measure one hand into `out`. `out.open` is the previous answer and is
 * kept while the spread sits between the two thresholds. Returns false when
 * the hand has too few landmarks. */
export function palmOf(
  points: Point[],
  rect: Rect,
  mirror: boolean,
  out: HandSample,
  t: number,
): boolean {
  if (points.length < 21) return false;
  const X = (p: Point) => rect.x + (mirror ? 1 - p.x : p.x) * rect.w,
    Y = (p: Point) => rect.y + p.y * rect.h,
    wx = X(points[0]),
    wy = Y(points[0]);
  let cx = 0,
    cy = 0,
    tips = 0;
  for (let k = 0; k < 5; k++) {
    cx += X(points[PALM[k]]) / 5;
    cy += Y(points[PALM[k]]) / 5;
    tips += Math.hypot(X(points[TIPS[k]]) - wx, Y(points[TIPS[k]]) - wy) / 5;
  }
  const size = Math.max(4, Math.hypot(X(points[9]) - wx, Y(points[9]) - wy)),
    pinch =
      Math.hypot(X(points[4]) - X(points[8]), Y(points[4]) - Y(points[8])) /
      size;
  out.x = cx;
  out.y = cy;
  out.size = size;
  out.t = t;
  out.spread = pinch < PINCH_BELOW ? 0 : tips / size;
  if (out.spread > OPEN_ABOVE) out.open = true;
  else if (out.spread < CLOSED_BELOW) out.open = false;
  return true;
}

/** How far, in palm sizes, a held ball's hand may move between results. */
export const REACH = 3;

/** Which of `count` measured hands drives the water, or -1 for none.
 * `found[h]` says whether hand h was measured. Held: the hand nearest the
 * ball, and none farther than REACH palm sizes, so when the holding hand
 * drops out for a result the other hand is not read as a flick or a fist.
 * `anywhere` lifts that limit for a frame whose mirror or stage size changed.
 * Otherwise the most open hand, so a pinch or an OK sign never wins. */
export function pickHand(
  samples: readonly HandSample[],
  found: readonly boolean[],
  count: number,
  held: { x: number; y: number } | null,
  anywhere: boolean,
): number {
  let pick = -1,
    best = Infinity;
  for (let h = 0; h < count; h++) {
    if (!found[h]) continue;
    const one = samples[h],
      score = held ? Math.hypot(one.x - held.x, one.y - held.y) : -one.spread;
    if (held && !anywhere && score > REACH * one.size) continue;
    if (score < best) {
      best = score;
      pick = h;
    }
  }
  return pick;
}
