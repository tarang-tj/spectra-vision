/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  applyHomography,
  orderCorners,
  solveSheet,
  type Mat3,
  type Pt,
} from "../src/panels/ruler/homography";
import {
  fitBox,
  invert3,
  renderTopDown,
  type Raster,
} from "../src/panels/ruler/topdown";

// Plane mm to picture px, in the sheet's own frame (its first corner is the
// origin). The picture is 800 x 600.
const BASE: Mat3 = [1.2, 0.1, 300, 0.05, 1.0, 200, 0.0001, 0.0011, 1];
const MAP: Mat3 = [
  BASE[0],
  BASE[1],
  BASE[1] * 700 + BASE[2],
  BASE[3],
  BASE[4],
  BASE[4] * 700 + BASE[5],
  BASE[6],
  BASE[7],
  BASE[7] * 700 + BASE[8],
];
const SIZE = { w: 800, h: 600 };
const inv = invert3(MAP)!;
const toPlane = (x: number, y: number): Pt => {
  const w = inv[6] * x + inv[7] * y + inv[8];
  return {
    x: (inv[0] * x + inv[1] * y + inv[2]) / w,
    y: (inv[3] * x + inv[4] * y + inv[5]) / w,
  };
};
/** A picture of a floor with a 100 mm checkerboard, as the camera sees it. */
function photo(): Raster {
  const data = new Uint8ClampedArray(SIZE.w * SIZE.h * 4);
  for (let y = 0; y < SIZE.h; y++)
    for (let x = 0; x < SIZE.w; x++) {
      const p = toPlane(x + 0.5, y + 0.5),
        on = (Math.floor(p.x / 100) + Math.floor(p.y / 100)) & 1,
        i = (y * SIZE.w + x) * 4;
      data[i] = on ? 230 : 40;
      data[i + 1] = data[i + 2] = data[i];
      data[i + 3] = 255;
    }
  return { data, w: SIZE.w, h: SIZE.h };
}
const sheet = solveSheet(
  orderCorners(
    [
      { x: 0, y: 0 },
      { x: 279.4, y: 0 },
      { x: 279.4, y: 215.9 },
      { x: 0, y: 215.9 },
    ].map((p) => applyHomography(MAP, p)!),
  ),
  279.4,
  215.9,
  false,
)!;

describe("top-down view", () => {
  const fit = fitBox({ x0: 0, y0: 0, x1: 800, y1: 500 }, 400, 300),
    out = renderTopDown(photo(), 1, sheet.h, null, fit)!;
  it("fits the plane box into the output size", () => {
    expect(fit.width).toBeLessThanOrEqual(400);
    expect(fit.height).toBeLessThanOrEqual(300);
    expect(fit.box.w * fit.ppm).toBeCloseTo(fit.width, 6);
    expect(fit.box.x0).toBeLessThan(0);
  });
  it("shows the checkerboard square and to scale", () => {
    // Every drawn pixel has the colour the floor really has at that spot.
    let drawn = 0,
      wrong = 0;
    for (let v = 0; v < out.h; v++)
      for (let u = 0; u < out.w; u++) {
        const o = (v * out.w + u) * 4;
        if (!out.data[o + 3]) continue;
        drawn++;
        const X = fit.box.x0 + (u + 0.5) / fit.ppm,
          Y = fit.box.y0 + (v + 0.5) / fit.ppm,
          edge =
            Math.abs(((X % 100) + 100) % 100) < 3 ||
            Math.abs(((Y % 100) + 100) % 100) < 3 ||
            Math.abs(((X % 100) + 100) % 100) > 97 ||
            Math.abs(((Y % 100) + 100) % 100) > 97;
        if (edge) continue; // cells' borders may fall either side by a pixel
        const on = (Math.floor(X / 100) + Math.floor(Y / 100)) & 1;
        if (out.data[o] !== (on ? 230 : 40)) wrong++;
      }
    expect(drawn).toBeGreaterThan(out.w * out.h * 0.3);
    expect(wrong / drawn).toBeLessThan(0.01);
  });
  it("leaves pixels beyond the horizon and outside the photo blank", () => {
    // Plane positions with w <= 0 are behind the camera's horizon (w <= 0).
    const wide = fitBox({ x0: -400, y0: -2500, x1: 2000, y1: 1500 }, 400, 300),
      r = renderTopDown(photo(), 1, sheet.h, null, wide)!;
    let blankBehind = 0,
      drawnBehind = 0,
      blankAny = 0;
    for (let v = 0; v < r.h; v++)
      for (let u = 0; u < r.w; u++) {
        const Y = wide.box.y0 + (v + 0.5) / wide.ppm,
          X = wide.box.x0 + (u + 0.5) / wide.ppm,
          alpha = r.data[(v * r.w + u) * 4 + 3],
          w = MAP[6] * X + MAP[7] * Y + MAP[8];
        if (!alpha) blankAny++;
        if (w <= 0) alpha ? drawnBehind++ : blankBehind++;
      }
    expect(blankBehind).toBeGreaterThan(0);
    expect(drawnBehind).toBe(0);
    expect(blankAny).toBeGreaterThan(blankBehind); // outside the photo too
  });
  it("blanks ground the photo cannot resolve instead of smearing it", () => {
    // Zoomed far out, near the horizon one photo pixel covers many output pixels.
    const zoom = fitBox({ x0: 0, y0: 0, x1: 400, y1: 300 }, 400, 300),
      near = renderTopDown(photo(), 1, sheet.h, null, zoom)!;
    let count = 0;
    for (let i = 3; i < near.data.length; i += 4) if (near.data[i]) count++;
    // At 1 px per mm the photo (about 1 px per mm in the near field) resolves
    // some of it; the same view at 20 px per mm resolves almost none.
    const tight = fitBox({ x0: 0, y0: 0, x1: 20, y1: 15 }, 400, 300),
      zoomed = renderTopDown(photo(), 1, sheet.h, null, tight)!;
    let tightCount = 0;
    for (let i = 3; i < zoomed.data.length; i += 4)
      if (zoomed.data[i]) tightCount++;
    expect(count).toBeGreaterThan(0);
    expect(tightCount).toBe(0);
  });
  it("inverts a matrix", () => {
    const m = invert3(MAP)!;
    const p = applyHomography(MAP, { x: 50, y: 60 })!,
      w = m[6] * p.x + m[7] * p.y + m[8];
    expect((m[0] * p.x + m[1] * p.y + m[2]) / w).toBeCloseTo(50, 6);
    expect(invert3([1, 2, 3, 2, 4, 6, 1, 1, 1])).toBeNull();
  });
});
