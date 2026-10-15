/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Histories of model output, as flat reused arrays. Pure: no DOM, no GL
 * (tests/effects-history.test.ts). */

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
