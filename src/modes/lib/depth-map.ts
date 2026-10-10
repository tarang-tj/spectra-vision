/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The flat view of a depth result: the map coloured and laid over the
// picture, its legend, and where its nearest and farthest values are.
import { colorAt, colorize } from "../../vision/depth/colormap";
import type { Frame } from "../../vision/frame";
import type { DepthExtra, Point } from "../../vision/types";

let painted: { values: Float32Array; canvas: HTMLCanvasElement } | null = null;

/** The map as a canvas of its own size, coloured once per result. */
export function mapCanvas(extra: DepthExtra): HTMLCanvasElement {
  if (painted && painted.values === extra.values) return painted.canvas;
  const canvas = painted?.canvas ?? document.createElement("canvas");
  canvas.width = extra.width;
  canvas.height = extra.height;
  const ctx = canvas.getContext("2d")!,
    image = ctx.createImageData(extra.width, extra.height);
  colorize(extra.values, extra.min, extra.max, image.data);
  ctx.putImageData(image, 0, 0);
  painted = { values: extra.values, canvas };
  return canvas;
}

/** Lay the coloured map over the picture, mirrored with it. */
export function drawMap(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  extra: DepthExtra,
  opacity: number,
) {
  if (!(opacity > 0)) return;
  const { rect } = frame;
  ctx.save();
  if (frame.mirror) {
    ctx.translate(frame.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mapCanvas(extra), rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

export type Legend = {
  /** What the bright and the dark end stand for, in words or metres. */
  near: string;
  far: string;
  /** One line under the bar: what kind of depth this is. */
  note: string;
};

const BAR = 132;
/** The colour scale with both ends named, in the picture's upper left
 * corner. Drawn on the stage so a screenshot carries it. */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  legend: Legend,
) {
  const { rect } = frame;
  ctx.save();
  ctx.font = "600 11px Inter Variable, sans-serif";
  const near = `Near ${legend.near}`.trim(),
    far = `Far ${legend.far}`.trim(),
    wide = Math.max(
      BAR,
      ctx.measureText(near).width + ctx.measureText(far).width + 18,
      ctx.measureText(legend.note).width,
    ),
    width = Math.min(wide + 20, rect.w - 16),
    x = rect.x + 8,
    // Under the stage's source badge; the lower corners hold its buttons.
    y = rect.y + 44;
  ctx.fillStyle = "rgba(7, 19, 14, 0.82)";
  ctx.fillRect(x, y, width, 58);
  const inner = width - 20,
    gradient = ctx.createLinearGradient(x + 10, 0, x + 10 + inner, 0);
  for (let i = 0; i <= 8; i++) {
    const [r, g, b] = colorAt(1 - i / 8);
    gradient.addColorStop(i / 8, `rgb(${r}, ${g}, ${b})`);
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(x + 10, y + 9, inner, 9);
  ctx.fillStyle = "#eef7f3";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(near, x + 10, y + 33, inner);
  ctx.textAlign = "right";
  ctx.fillText(far, x + 10 + inner, y + 33, inner);
  ctx.textAlign = "left";
  ctx.font = "500 10px Inter Variable, sans-serif";
  ctx.fillStyle = "#b9cbc4";
  ctx.fillText(legend.note, x + 10, y + 49, inner);
  ctx.restore();
}

let found: {
  values: Float32Array;
  near: Point;
  far: Point;
} | null = null;

/** Where the map's largest value (nearest) and smallest value (farthest)
 * sit, image-normalized. Worked out once per result. */
export function extremes(extra: DepthExtra): { near: Point; far: Point } {
  if (found && found.values === extra.values) return found;
  const { values, width, height } = extra;
  let low = 0,
    high = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[low]) low = i;
    if (values[i] > values[high]) high = i;
  }
  const at = (cell: number): Point => ({
    x: ((cell % width) + 0.5) / width,
    y: (Math.floor(cell / width) + 0.5) / height,
  });
  found = { values, near: at(high), far: at(low) };
  return found;
}

/** A ring on the picture at an image-normalized point. */
export function drawMarker(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  point: Point,
  label: string,
) {
  const q = frame.project(point);
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#07130e";
  ctx.beginPath();
  ctx.arc(q.x, q.y, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();
  ctx.font = "600 12px Inter Variable, sans-serif";
  const width = ctx.measureText(label).width + 12,
    left = Math.min(
      Math.max(q.x + 12, frame.rect.x),
      frame.rect.x + frame.rect.w - width,
    );
  ctx.fillStyle = "rgba(7, 19, 14, 0.82)";
  ctx.fillRect(left, q.y - 11, width, 22);
  ctx.fillStyle = "#eef7f3";
  ctx.fillText(label, left + 6, q.y + 4);
  ctx.restore();
}
