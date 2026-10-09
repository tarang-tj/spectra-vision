/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Synthetic floor photos for the room-scale Ruler tests. The truth is exact
// because each picture is drawn from a known plane-to-picture map: a Letter
// sheet, a rectangular "room" outline on the floor, and a 50 mm grid. The
// bent variant is drawn through a known one-parameter radial lens.

export type P = { x: number; y: number };
export const IMAGE = { w: 1200, h: 900 };
/** Plane millimetres to picture pixels, row-major. */
export const H = [0.5, 0.03, 40, 0.01, 0.42, 40, 0.00003, 0.00006, 1];
/** The reference: a 1000 x 700 mm board (a custom reference), because one
 * sheet of paper is too small to measure a room well. */
export const SHEET = { x: 100, y: 100, w: 1000, h: 700 };
/** The room: a 1200 x 800 mm rectangle on the floor, clockwise. */
export const ROOM: P[] = [
  { x: 1150, y: 100 },
  { x: 2350, y: 100 },
  { x: 2350, y: 900 },
  { x: 1150, y: 900 },
];
export const ROOM_AREA_MM2 = 1200 * 800;
export const ROOM_PERIMETER_MM = 4000;
/** Lens coefficient of the bent picture (model: ideal = c + (p - c)(1 + k r^2),
 * r in units of the half diagonal). */
export const K = 0.25;

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

/** Where an ideal (undistorted) picture point lands in the bent picture:
 * the inverse of the radial model, by fixed-point iteration. */
export function bend(q: P, k = K): P {
  const cx = IMAGE.w / 2,
    cy = IMAGE.h / 2,
    norm = Math.hypot(IMAGE.w, IMAGE.h) / 2;
  let x = q.x,
    y = q.y;
  for (let i = 0; i < 40; i++) {
    const f = 1 + (k * ((x - cx) ** 2 + (y - cy) ** 2)) / (norm * norm);
    x = cx + (q.x - cx) / f;
    y = cy + (q.y - cy) / f;
  }
  return { x, y };
}
/** Points along a plane line, mapped into the bent picture. */
export const bentLine = (a: P, b: P, n: number): P[] =>
  Array.from({ length: n }, (_, i) =>
    bend(
      toImage({
        x: a.x + ((b.x - a.x) * i) / (n - 1),
        y: a.y + ((b.y - a.y) * i) / (n - 1),
      }),
    ),
  );

/** Runs in the browser; returns a PNG as base64. Self-contained (no imports).
 * `k` is the lens coefficient (0 for a straight picture). */
export function drawRoom(args: {
  w: number;
  h: number;
  H: number[];
  k: number;
  sheet: { x: number; y: number; w: number; h: number };
  room: { x: number; y: number }[];
}): string {
  const { w, h, H: m, k, sheet, room } = args,
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
    cx = w / 2,
    cy = h / 2,
    norm = Math.hypot(w, h) / 2,
    canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!,
    img = ctx.createImageData(w, h),
    x0 = Math.min(...room.map((p) => p.x)),
    x1 = Math.max(...room.map((p) => p.x)),
    y0 = Math.min(...room.map((p) => p.y)),
    y1 = Math.max(...room.map((p) => p.y));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      // Bent picture pixel to ideal picture point to floor position.
      const f = 1 + (k * ((x - cx) ** 2 + (y - cy) ** 2)) / (norm * norm),
        ux = cx + (x - cx) * f,
        uy = cy + (y - cy) * f,
        s = inv[6] * ux + inv[7] * uy + inv[8],
        px = (inv[0] * ux + inv[1] * uy + inv[2]) / s,
        py = (inv[3] * ux + inv[4] * uy + inv[5]) / s;
      let c = 130;
      if (Math.abs(px % 50) < 1.5 || Math.abs(py % 50) < 1.5) c = 95;
      if (
        px >= sheet.x &&
        px <= sheet.x + sheet.w &&
        py >= sheet.y &&
        py <= sheet.y + sheet.h
      )
        c = 245;
      // The room outline, 6 mm wide.
      const onX =
          (Math.abs(px - x0) < 3 || Math.abs(px - x1) < 3) &&
          py >= y0 - 3 &&
          py <= y1 + 3,
        onY =
          (Math.abs(py - y0) < 3 || Math.abs(py - y1) < 3) &&
          px >= x0 - 3 &&
          px <= x1 + 3;
      if (onX || onY) c = 20;
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}
