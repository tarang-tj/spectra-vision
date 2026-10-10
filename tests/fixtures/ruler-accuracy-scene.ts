/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A synthetic room for the accuracy tests: a pinhole camera built by hand
// (height, tilt, focal length) looking along a floor, with exact truth for
// everything on it. Nothing here uses the Ruler's own code. Floor points are
// millimetres: x to the right, y away from the camera, the camera above the
// origin.

export type P = { x: number; y: number };
export type Shot = { w: number; h: number; f: number; up: number; tilt: number };

/** The camera the fixed scenes use: 1.5 m up, looking 35 degrees down. */
export const SHOT: Shot = {
  w: 1600,
  h: 1200,
  f: 1300,
  up: 1500,
  tilt: (35 * Math.PI) / 180,
};

/** A floor point to picture pixels. */
export function shoot(c: Shot, p: P): P {
  const cos = Math.cos(c.tilt),
    sin = Math.sin(c.tilt),
    // Along the view, and down the picture, from the camera centre.
    depth = p.y * cos + c.up * sin,
    down = -p.y * sin + c.up * cos;
  return {
    x: c.w / 2 + (c.f * p.x) / depth,
    y: c.h / 2 + (c.f * down) / depth,
  };
}

/** Corners of a `long` x `short` rectangle lying at `at`, turned by `turn`. */
export function rectangle(at: P, long: number, short: number, turn = 0): P[] {
  const cos = Math.cos(turn),
    sin = Math.sin(turn);
  return [
    [-long / 2, -short / 2],
    [long / 2, -short / 2],
    [long / 2, short / 2],
    [-long / 2, short / 2],
  ].map(([x, y]) => ({
    x: at.x + x * cos - y * sin,
    y: at.y + x * sin + y * cos,
  }));
}

export const LETTER = { long: 279.4, short: 215.9 };
/** The first sheet, 1.5 m in front of the camera. */
export const SHEET_1: P = { x: 0, y: 1500 };
/** The second sheet, two metres further away and off to one side. */
export const SHEET_2: P = { x: 800, y: 3500 };
/** A 3 m span whose length the user measured with a tape (a wall's foot). */
export const KNOWN: [P, P] = [
  { x: -1500, y: 4800 },
  { x: 1500, y: 4800 },
];
export const KNOWN_MM = 3000;
/** Three 1 m spans (800 across, 600 away), near, middle and far. */
const span = (y: number): [P, P] => [
  { x: -400, y },
  { x: 400, y: y + 600 },
];
export const SPANS = { near: span(1800), middle: span(3300), far: span(5000) };
export const SPAN_MM = 1000;

/** Uniform numbers in [0, 1) from a seed (a plain linear congruential
 * generator, on purpose not the Ruler's). */
export function uniform(seed: number): () => number {
  let s = seed >>> 0;
  const next = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  // Two draws per number: the high bits of each are the good ones.
  return () => ((next() >>> 6) * 67108864 + (next() >>> 5)) / 2 ** 53;
}
/** Standard normal numbers from a uniform source (polar method). */
export function normal(u: () => number): () => number {
  return () => {
    for (;;) {
      const a = 2 * u() - 1,
        b = 2 * u() - 1,
        r = a * a + b * b;
      if (r > 0 && r < 1) return a * Math.sqrt((-2 * Math.log(r)) / r);
    }
  };
}

/** Draw the room in the browser; returns a PNG as base64. Self-contained (no
 * imports). `sheets` are floor polygons drawn white; `lines` are floor
 * segments drawn dark, 10 mm wide. */
export function drawAccuracyRoom(args: {
  c: Shot;
  sheets: P[][];
  lines: [P, P][];
}): string {
  const { c, sheets, lines } = args,
    cos = Math.cos(c.tilt),
    sin = Math.sin(c.tilt),
    canvas = document.createElement("canvas");
  canvas.width = c.w;
  canvas.height = c.h;
  const ctx = canvas.getContext("2d")!,
    img = ctx.createImageData(c.w, c.h),
    within = (poly: P[], x: number, y: number) => {
      let sign = 0;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i],
          b = poly[(i + 1) % poly.length],
          z = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (z !== 0) {
          if (sign && Math.sign(z) !== sign) return false;
          sign = Math.sign(z);
        }
      }
      return true;
    },
    near = (a: P, b: P, x: number, y: number) => {
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy)),
        );
      return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) < 5;
    };
  for (let v = 0; v < c.h; v++)
    for (let u = 0; u < c.w; u++) {
      // Picture pixel back to the floor: the inverse of `shoot`.
      const dx = (u - c.w / 2) / c.f,
        dy = (v - c.h / 2) / c.f,
        fall = sin + dy * cos;
      let shade = 60; // above the horizon
      if (fall > 1e-6) {
        const depth = c.up / fall,
          x = dx * depth,
          y = (cos - dy * sin) * depth;
        shade = 130;
        if (Math.abs(x % 500) < 4 || Math.abs(y % 500) < 4) shade = 100;
        if (sheets.some((s) => within(s, x, y))) shade = 245;
        if (lines.some(([a, b]) => near(a, b, x, y))) shade = 20;
      }
      const i = (v * c.w + u) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = shade;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}
