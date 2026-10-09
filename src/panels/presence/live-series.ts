/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { angleDifference } from "../../measure/angles";
import { Series } from "../../measure/series";
import type { Baseline } from "./calibration";
import type { Signals } from "./types";

export type ChartId = "head" | "hands" | "sway" | "still" | "expression";
/** Seconds of history on each strip chart. */
export const CHART_SPAN_MS = 30_000;

/** The raw signal behind each metric, kept for the strip charts only: a ring of
 * (time, value) points per metric, one value per new model result. Nothing is
 * smoothed. A chart of a signal whose baseline is missing stays empty. */
export class LiveSeries {
  readonly series: Record<ChartId, Series> = {
    head: new Series(900),
    hands: new Series(900),
    sway: new Series(900),
    still: new Series(900),
    expression: new Series(900),
  };

  clear() {
    for (const s of Object.values(this.series)) s.clear();
  }

  push(sig: Signals, base: Baseline) {
    const { face, pose, hand } = sig;
    if (face && base.face)
      this.series.head.push(
        face.t,
        Math.hypot(
          angleDifference(face.yaw, base.face.yaw),
          face.pitch - base.face.pitch,
        ),
      );
    if (face) this.series.expression.push(face.t, face.change);
    if (pose && base.pose) {
      const { scale, x0 } = base.pose;
      this.series.sway.push(pose.t, Math.abs(pose.x / scale - x0));
      this.series.still.push(pose.t, pose.motion / scale);
    }
    if (hand && base.pose) {
      const speeds = hand.hands
        .map((h) => h.speed / base.pose!.scale)
        .filter(Number.isFinite);
      if (speeds.length) this.series.hands.push(hand.t, Math.max(...speeds));
    }
  }
}
