/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The room's floor seen from above, from every picture on the plan. Each
// output pixel is a spot on the floor in the room's frame; every picture that
// shows that spot well enough is asked, and the one that shows it in the most
// pixels wins, which for like cameras is the nearer one. The tests that keep
// one picture's top-down view honest (topdown.ts) apply to each picture here:
// nothing beyond the horizon, outside the photo, or too far to resolve.
// Pure: no DOM.
import { invert3 } from "../known/fused-maths";
import type { Mat3 } from "../homography";
import { invertLens, type Lens } from "../lens";
import {
  SMEAR_LIMIT,
  worstStretch,
  type Fit,
  type Raster,
} from "../plan/topdown";
import type { Rigid } from "./room-frame";

/** One picture ready to be laid on the plan. */
export type Layer = {
  /** The picture's pixels and that copy's size relative to the real one. */
  raster: Raster;
  scale: number;
  /** Real-picture pixels (after the lens correction) to the room's frame. */
  h: Mat3;
  lens: Lens | null;
};

/** A picture's own plane map followed by its turn into the room's frame. */
export function toRoomMap(t: Rigid, h: Mat3): Mat3 {
  const r = [t.a, -t.b, t.tx, t.b, t.a, t.ty, 0, 0, 1],
    out: number[] = [];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out.push(
        r[i * 3] * h[j] + r[i * 3 + 1] * h[3 + j] + r[i * 3 + 2] * h[6 + j],
      );
  return out as unknown as Mat3;
}

export type Merged = {
  image: Raster;
  /** Per output pixel: which layer it came from, counted from 1; 0 is none. */
  from: Uint8Array;
};

/** Lay every layer on the plan box `fit`. */
export function mergeTopDown(layers: readonly Layer[], fit: Fit): Merged {
  const { box, width, height, ppm } = fit,
    data = new Uint8ClampedArray(width * height * 4),
    from = new Uint8Array(width * height),
    ready = layers.map((l) => ({ ...l, inv: invert3(l.h) })),
    limit = SMEAR_LIMIT / ppm;
  for (let v = 0; v < height; v++) {
    const Y = box.y0 + (v + 0.5) / ppm;
    for (let u = 0; u < width; u++) {
      const X = box.x0 + (u + 0.5) / ppm;
      let best = Infinity,
        at = -1,
        pick = 0;
      for (let k = 0; k < ready.length; k++) {
        const { inv, h, scale, lens, raster } = ready[k];
        if (!inv) continue;
        const w = inv[6] * X + inv[7] * Y + inv[8];
        if (!(w > 1e-9)) continue; // beyond this picture's horizon
        // Floor mm covered by one pixel of the copy, in its worst direction.
        const mmPerPx = worstStretch(h, X, Y, 1 / w) / scale;
        if (!(mmPerPx <= limit) || mmPerPx >= best) continue;
        const p = invertLens(lens, {
            x: (inv[0] * X + inv[1] * Y + inv[2]) / w,
            y: (inv[3] * X + inv[4] * Y + inv[5]) / w,
          }),
          sx = Math.floor(p.x * scale),
          sy = Math.floor(p.y * scale);
        if (sx < 0 || sy < 0 || sx >= raster.w || sy >= raster.h) continue;
        best = mmPerPx;
        at = (sy * raster.w + sx) * 4;
        pick = k + 1;
      }
      if (!pick) continue;
      const src = ready[pick - 1].raster.data,
        o = (v * width + u) * 4;
      data[o] = src[at];
      data[o + 1] = src[at + 1];
      data[o + 2] = src[at + 2];
      data[o + 3] = 255;
      from[v * width + u] = pick;
    }
  }
  return { image: { data, w: width, h: height }, from };
}
