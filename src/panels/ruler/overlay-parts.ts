/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Small drawing helpers shared by the Ruler's stage overlay parts.
import { keepClear, tag, type Rank } from "./overlay-labels";

export { INK, tag } from "./overlay-labels";
export const REF = "#ffd18d";
export const LINE = "#a4ffd9";
export const PATH = "#8ec5ff";
export const EDGE = "#ffb3c7";

export function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  rank: Rank = "optional",
) {
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.35;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 1.5, 0, Math.PI * 2);
  ctx.fill();
  keepClear(x, y);
  if (label) tag(label, x + 10, y - 10, color, rank);
}
