/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Histories of model output, as flat reused arrays. Pure: no DOM, no GL
 * (tests/effects-history.test.ts). */

/** The recent path of one tracked point: x, y pairs with the time each was
 * measured, oldest first. */
export type Trail = {
  xy: Float32Array;
  times: Float64Array;
  count: number;
  capacity: number;
};
export const createTrail = (capacity: number): Trail => ({
  xy: new Float32Array(capacity * 2),
  times: new Float64Array(capacity),
  count: 0,
  capacity,
});

/** Append a measured position. Positions closer than `minMove` to the last
 * one are skipped, so a still point does not fill the trail. When the trail
 * is full the oldest point is dropped. Returns true if a point was added. */
export function pushTrail(
  trail: Trail,
  x: number,
  y: number,
  time: number,
  minMove: number,
): boolean {
  const n = trail.count;
  if (n > 0) {
    const dx = x - trail.xy[2 * n - 2],
      dy = y - trail.xy[2 * n - 1];
    if (Math.hypot(dx, dy) < minMove) return false;
  }
  if (n === trail.capacity) {
    trail.xy.copyWithin(0, 2);
    trail.times.copyWithin(0, 1);
    trail.count--;
  }
  trail.xy[2 * trail.count] = x;
  trail.xy[2 * trail.count + 1] = y;
  trail.times[trail.count++] = time;
  return true;
}

/** Drop points measured more than `maxAge` before `now`. The newest point is
 * always kept: it is where the tracked point is. */
export function trimTrail(trail: Trail, now: number, maxAge: number) {
  let drop = 0;
  while (drop < trail.count - 1 && now - trail.times[drop] > maxAge) drop++;
  if (!drop) return;
  trail.xy.copyWithin(0, 2 * drop, 2 * trail.count);
  trail.times.copyWithin(0, drop, trail.count);
  trail.count -= drop;
}

/** In a ring of `filled` time stamps whose next write position is `head`,
 * find the newest entry that is at least as old as `at`. Returns its index,
 * or -1 when every entry is newer. */
export function delayedIndex(
  times: ArrayLike<number>,
  head: number,
  filled: number,
  at: number,
): number {
  const size = times.length;
  for (let back = 1; back <= filled; back++) {
    const index = (head - back + size * 2) % size;
    if (times[index] <= at) return index;
  }
  return -1;
}
