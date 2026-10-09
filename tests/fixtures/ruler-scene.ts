/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A synthetic photo for the Ruler browser test: a flat plane seen in
// perspective through a KNOWN homography, holding a US Letter sheet and two
// marks a known distance apart. The truth is exact because the picture is
// drawn from it.

export type P = { x: number; y: number };
export const IMAGE = { w: 1200, h: 900 };
/** Plane millimetres to image pixels, row-major. */
export const H = [1.5, 0.12, 80, 0.05, 1.4, 60, 0.00012, 0.00025, 1];
export const SHEET = { x: 60, y: 60, w: 279.4, h: 215.9 };
export const MARK_A: P = { x: 120, y: 400 };
export const MARK_B: P = { x: 620, y: 300 };
export const TRUTH_MM = Math.hypot(MARK_B.x - MARK_A.x, MARK_B.y - MARK_A.y);

export const toImage = (p: P): P => {
  const w = H[6] * p.x + H[7] * p.y + H[8];
  return {
    x: (H[0] * p.x + H[1] * p.y + H[2]) / w,
    y: (H[3] * p.x + H[4] * p.y + H[5]) / w,
  };
};
export const sheetCorners = (): P[] =>
  [
    { x: SHEET.x, y: SHEET.y },
    { x: SHEET.x + SHEET.w, y: SHEET.y },
    { x: SHEET.x + SHEET.w, y: SHEET.y + SHEET.h },
    { x: SHEET.x, y: SHEET.y + SHEET.h },
  ].map(toImage);

/** Runs in the browser: draws the scene pixel by pixel through the inverse
 * homography and returns a PNG as base64. Self-contained (no imports). */
export function drawScene(args: {
  w: number;
  h: number;
  H: number[];
  sheet: { x: number; y: number; w: number; h: number };
  marks: { x: number; y: number }[];
}): string {
  const { w, h, H: m, sheet, marks } = args,
    det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]),
    inv = [
      (m[4] * m[8] - m[5] * m[7]) / det,
      (m[2] * m[7] - m[1] * m[8]) / det,
      (m[1] * m[5] - m[2] * m[4]) / det,
      (m[5] * m[6] - m[3] * m[8]) / det,
      (m[0] * m[8] - m[2] * m[6]) / det,
      (m[2] * m[3] - m[0] * m[5]) / det,
      (m[3] * m[7] - m[4] * m[6]) / det,
      (m[1] * m[6] - m[0] * m[7]) / det,
      (m[0] * m[4] - m[1] * m[3]) / det,
    ],
    canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!,
    img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = inv[6] * x + inv[7] * y + inv[8],
        px = (inv[0] * x + inv[1] * y + inv[2]) / k,
        py = (inv[3] * x + inv[4] * y + inv[5]) / k;
      let c = 120;
      if (Math.abs(px % 50) < 1.2 || Math.abs(py % 50) < 1.2) c = 95;
      if (
        px >= sheet.x &&
        px <= sheet.x + sheet.w &&
        py >= sheet.y &&
        py <= sheet.y + sheet.h
      )
        c = 245;
      for (const mk of marks) if (Math.hypot(px - mk.x, py - mk.y) < 7) c = 20;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}
