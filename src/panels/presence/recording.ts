/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Recording, Signals } from "./types";

/** Add one merged result to a recording. `step` is the result-clock time since
 * the previous result (0 for the first one and after a gap). Face and pose
 * results that saw nothing are kept as null stamps. */
export function recordSignals(rec: Recording, sig: Signals, step: number) {
  rec.results++;
  rec.coveredMs += step;
  if (step > 0) rec.steps++;
  if (sig.face !== undefined) {
    rec.fresh.face++;
    if (sig.face) rec.seen.face++;
    rec.face.push({ t: sig.face?.t ?? sig.t, s: sig.face });
  }
  if (sig.pose !== undefined) {
    rec.fresh.pose++;
    if (sig.pose) rec.seen.pose++;
    rec.pose.push({ t: sig.pose?.t ?? sig.t, s: sig.pose });
  }
  if (sig.hand) {
    rec.fresh.hand++;
    rec.hand.push(sig.hand);
    if (sig.hand.hands.length) rec.seen.hand++;
  }
}
