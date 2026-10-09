/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Small drawing helpers shared by the Ruler's stage overlay parts.
export const REF = "#ffd18d";
export const LINE = "#a4ffd9";
export const PATH = "#8ec5ff";
export const EDGE = "#ffb3c7";
export const INK = "#0b1214";
const FONT = "600 12px system-ui, sans-serif";

export function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
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
  if (label) tag(ctx, label, x + 10, y - 10, color);
}

export function tag(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = FONT;
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = INK;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x - 5, y - 11, w, 18);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 2);
}
