/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Box } from "./types";
export function iou(a: Box, b: Box) {
  const overlap =
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlap / Math.max(1e-9, a.w * a.h + b.w * b.h - overlap);
}

export const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Assignment that maximizes the total of `gain` (rows = tracks, columns =
 * detections); a pair with gain 0 is treated as unassigned. Hungarian
 * algorithm on a square matrix padded with zeros. Returns column per row. */
export function assign(gain: number[][], rows: number, cols: number): number[] {
  const n = Math.max(rows, cols),
    cost = (i: number, j: number) => (i < rows && j < cols ? -gain[i][j] : 0),
    u = new Array<number>(n + 1).fill(0),
    v = new Array<number>(n + 1).fill(0),
    p = new Array<number>(n + 1).fill(0),
    way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity),
      used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++)
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const column = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= n; j++)
    if (p[j] >= 1 && p[j] <= rows && j <= cols) column[p[j] - 1] = j - 1;
  return column;
}

/** What `pairGain` needs to know about a track and the gating options. */
export type GainTrack = {
  label: string;
  box: Box;
  confirmed: boolean;
};
export type GainOptions = {
  minIou: number;
  maxCentre: number;
  tentativeIou: number;
};

/** Gain for giving a detection to a track (0 = not allowed). The detection
 * must fit the velocity-predicted box or the last seen box. An unconfirmed
 * track has no velocity and lives for a second, so it only takes a detection
 * that overlaps its box clearly: that keeps random flickers from joining up. */
export function pairGain(
  t: GainTrack,
  predicted: Box,
  d: { label: string; box: Box },
  o: GainOptions,
  slow = false,
  reach = 1,
): number {
  if (d.label !== t.label) return 0;
  const e = centre(d.box);
  if (!t.confirmed && !slow) {
    if (iou(d.box, t.box) <= o.tentativeIou) return 0;
  } else {
    let allowed = false;
    for (const box of [predicted, t.box]) {
      const c = centre(box);
      if (
        iou(d.box, box) > o.minIou ||
        Math.hypot(e.x - c.x, e.y - c.y) < o.maxCentre * reach
      )
        allowed = true;
    }
    if (!allowed) return 0;
  }
  const c = centre(predicted);
  return (
    1e-6 +
    Math.max(0, iou(d.box, predicted)) +
    0.15 * Math.max(0, 1 - Math.hypot(e.x - c.x, e.y - c.y))
  );
}
