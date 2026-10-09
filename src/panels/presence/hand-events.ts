/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { MAX_STEP_MS } from "./types";

export type SpeedSample = { t: number; speed: number };

/** Movement starts of one hand: a start is counted when the speed rises to the
 * threshold or above after the hand has been under it for at least `stillMs`.
 * Time is counted step by step from the sample before; a missing speed (NaN:
 * the hand just came into view) or a gap longer than MAX_STEP_MS restarts the
 * still timer, so a hand entering the picture is not a start. A start ends when
 * the speed drops back under the threshold. */
export function countStarts(
  samples: readonly SpeedSample[],
  threshold: number,
  stillMs: number,
): number {
  let still = 0,
    moving = false,
    starts = 0;
  samples.forEach((s, i) => {
    const dt = i ? s.t - samples[i - 1].t : 0;
    if (!Number.isFinite(s.speed) || dt <= 0 || dt > MAX_STEP_MS) {
      still = 0;
      moving = false;
      return;
    }
    if (s.speed >= threshold) {
      if (!moving && still >= stillMs) starts++;
      moving = true;
      still = 0;
    } else {
      moving = false;
      still += dt;
    }
  });
  return starts;
}
