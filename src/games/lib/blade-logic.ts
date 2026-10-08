/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Pure rules of Slice's blades: following each index fingertip from one
// model result to the next and deciding whether its movement was a slice.
// No DOM, canvas or audio. Positions are in play space (see slice-logic.ts).

export const MAX_BLADES = 2;
/** Slowest stroke that slices, in image heights per second. */
export const MIN_SLICE_SPEED = 0.7;
/** A longer jump between two results is a re-detection, not a stroke. */
export const MAX_JUMP = 0.9;
/** Results further apart than this are not joined into one stroke. */
export const MAX_GAP_MS = 500;

/** One fingertip followed across model results. `px,py` is where it was on
 * the previous result, so `px,py -> x,y` is the stroke to test. */
export type Blade = {
  live: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Length of the last stroke and the time it took. Zero on first sight. */
  moved: number;
  dtMs: number;
  seen: number;
};
export type Blades = { blades: Blade[]; claimed: boolean[] };

export function createBlades(): Blades {
  return {
    blades: Array.from({ length: MAX_BLADES }, () => ({
      live: false,
      x: 0,
      y: 0,
      px: 0,
      py: 0,
      moved: 0,
      dtMs: 0,
      seen: 0,
    })),
    claimed: new Array<boolean>(MAX_BLADES).fill(false),
  };
}

/** Was that movement a slice: fast enough, and plausibly one continuous move. */
export function isSlice(moved: number, dtMs: number) {
  if (!(dtMs > 0) || dtMs > MAX_GAP_MS || moved > MAX_JUMP) return false;
  return moved / (dtMs / 1000) >= MIN_SLICE_SPEED;
}

/** Follow up to two fingertips from one model result to the next. Each new
 * tip continues the nearest blade; the model may list hands in any order. */
export function updateBlades(
  state: Blades,
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  count: number,
  time: number,
) {
  const { blades, claimed } = state;
  claimed.fill(false);
  for (let i = 0; i < Math.min(count, blades.length); i++) {
    let best = -1,
      bestDistance = MAX_JUMP;
    for (let b = 0; b < blades.length; b++) {
      if (claimed[b] || !blades[b].live) continue;
      // Math.sqrt, not Math.hypot: hypot allocates for its argument list.
      const dx = xs[i] - blades[b].x,
        dy = ys[i] - blades[b].y,
        distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= bestDistance) {
        best = b;
        bestDistance = distance;
      }
    }
    const fresh = best < 0;
    // A new fingertip takes a free slot: an idle one first, else any.
    for (let b = 0; fresh && best < 0 && b < blades.length; b++)
      if (!claimed[b] && !blades[b].live) best = b;
    if (best < 0) best = claimed.indexOf(false);
    if (best < 0) return;
    const blade = blades[best];
    claimed[best] = true;
    blade.px = fresh ? xs[i] : blade.x;
    blade.py = fresh ? ys[i] : blade.y;
    blade.moved = fresh ? 0 : bestDistance;
    blade.dtMs = fresh ? 0 : time - blade.seen;
    blade.x = xs[i];
    blade.y = ys[i];
    blade.seen = time;
    blade.live = true;
  }
  for (let b = 0; b < blades.length; b++)
    if (!claimed[b]) blades[b].live = false;
}
