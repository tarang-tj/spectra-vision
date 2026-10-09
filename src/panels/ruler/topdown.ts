/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The rectified bird's-eye image of the surface. For every output pixel the
// plane position is mapped back into the frozen picture and the colour copied
// (nearest pixel). Where the picture cannot say what is there, the pixel is
// left transparent instead of being smeared: beyond the horizon, outside the
// photo, or too far away for the photo's pixels to resolve at this scale.
import type { Mat3, Pt } from "./homography";
import { invertLens, type Lens } from "./lens";

export type Raster = {
  data: Uint8ClampedArray<ArrayBuffer>;
  w: number;
  h: number;
};
/** Plane box in mm and the output size it is drawn at. */
export type Box = { x0: number; y0: number; w: number; h: number };
export type Fit = { box: Box; width: number; height: number; ppm: number };

/** One photo pixel may cover at most this many output pixels. */
export const SMEAR_LIMIT = 2;

/** The output size and the plane box (grown to the output's aspect) that
 * hold `bounds` with a margin. `ppm` is output pixels per mm. */
export function fitBox(
  bounds: { x0: number; y0: number; x1: number; y1: number },
  maxW = 480,
  maxH = 360,
): Fit {
  const bw = Math.max(1, bounds.x1 - bounds.x0),
    bh = Math.max(1, bounds.y1 - bounds.y0),
    pad = Math.max(bw, bh) * 0.08,
    tw = bw + 2 * pad,
    th = bh + 2 * pad,
    ppm = Math.min(maxW / tw, maxH / th),
    width = Math.max(1, Math.ceil(tw * ppm)),
    height = Math.max(1, Math.ceil(th * ppm)),
    w = width / ppm,
    h = height / ppm;
  return {
    box: {
      x0: (bounds.x0 + bounds.x1) / 2 - w / 2,
      y0: (bounds.y0 + bounds.y1) / 2 - h / 2,
      w,
      h,
    },
    width,
    height,
    ppm,
  };
}

const det3 = (m: Mat3) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) -
  m[1] * (m[3] * m[8] - m[5] * m[6]) +
  m[2] * (m[3] * m[7] - m[4] * m[6]);

/** Inverse of a 3x3 matrix, or null when singular. */
export function invert3(m: Mat3): Mat3 | null {
  const d = det3(m);
  if (!Number.isFinite(d) || Math.abs(d) < 1e-300) return null;
  return [
    (m[4] * m[8] - m[5] * m[7]) / d,
    (m[2] * m[7] - m[1] * m[8]) / d,
    (m[1] * m[5] - m[2] * m[4]) / d,
    (m[5] * m[6] - m[3] * m[8]) / d,
    (m[0] * m[8] - m[2] * m[6]) / d,
    (m[2] * m[3] - m[0] * m[5]) / d,
    (m[3] * m[7] - m[4] * m[6]) / d,
    (m[1] * m[6] - m[0] * m[7]) / d,
    (m[0] * m[4] - m[1] * m[3]) / d,
  ] as const;
}

/** Largest singular value of the Jacobian of `h` at a picture point whose
 * plane position is (X, Y) and whose homogeneous scale is `wh`: plane mm per
 * picture pixel in the worst direction. */
export function worstStretch(
  h: Mat3,
  X: number,
  Y: number,
  wh: number,
): number {
  const a = (h[0] - X * h[6]) / wh,
    b = (h[1] - X * h[7]) / wh,
    c = (h[3] - Y * h[6]) / wh,
    d = (h[4] - Y * h[7]) / wh,
    s = a * a + b * b + c * c + d * d,
    det = a * d - b * c;
  return Math.sqrt((s + Math.sqrt(Math.max(0, s * s - 4 * det * det))) / 2);
}

/** Draw the surface seen from above. `h` maps picture pixels (after lens
 * correction) to plane mm; `src` is the frozen picture, `srcScale` its size
 * relative to the real picture; `at` converts real-picture pixels to it. */
export function renderTopDown(
  src: Raster,
  srcScale: number,
  h: Mat3,
  lens: Lens | null,
  fit: Fit,
): Raster | null {
  const inv = invert3(h);
  if (!inv) return null;
  const { box, width, height, ppm } = fit,
    out = new Uint8ClampedArray(width * height * 4),
    // inv * (X, Y, 1) has w = 1 / w_h, and w_h is positive in front of the
    // camera (solveHomography fixes it to 1 at the reference), so a plane
    // position with w <= 0 here is at or beyond the horizon.
    mmPerOut = 1 / ppm;
  for (let v = 0; v < height; v++) {
    const Y = box.y0 + (v + 0.5) / ppm;
    for (let u = 0; u < width; u++) {
      const X = box.x0 + (u + 0.5) / ppm,
        w = inv[6] * X + inv[7] * Y + inv[8];
      if (!(w > 1e-9)) continue; // beyond the horizon
      const q = {
          x: (inv[0] * X + inv[1] * Y + inv[2]) / w,
          y: (inv[3] * X + inv[4] * Y + inv[5]) / w,
        },
        // Local Jacobian of the picture-to-plane map: one pixel of the copy
        // covers at most this many mm of plane, in its worst direction (along
        // depth near the horizon, far more than across).
        mmPerCopyPx = worstStretch(h, X, Y, 1 / w) / srcScale;
      if (!(mmPerCopyPx <= SMEAR_LIMIT * mmPerOut)) continue; // too far to resolve
      const p: Pt = invertLens(lens, q),
        sx = Math.floor(p.x * srcScale),
        sy = Math.floor(p.y * srcScale);
      if (sx < 0 || sy < 0 || sx >= src.w || sy >= src.h) continue; // off the photo
      const i = (sy * src.w + sx) * 4,
        o = (v * width + u) * 4;
      out[o] = src.data[i];
      out[o + 1] = src.data[i + 1];
      out[o + 2] = src.data[i + 2];
      out[o + 3] = 255;
    }
  }
  return { data: out, w: width, h: height };
}
