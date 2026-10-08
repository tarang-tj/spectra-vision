/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// What every game draws on the stage canvas around its own play field: the
// score bar, the mute button and small notes (the 3-2-1 start and the result
// card are in round-screens.ts). It is all canvas so that a recording or a
// screenshot of the stage contains it.
import type { Frame } from "../../vision/frame";
import { multiplier, secondsLeft } from "./round";
import type { Round } from "./round";

export const FONT = '"Inter Variable", Inter, system-ui, sans-serif';
export const MINT = "#a4ffd9",
  INK = "#f3f7f6",
  MUTED = "#b1bec3",
  AMBER = "#ffd18d",
  ROSE = "#ff8ab4",
  SCRIM = "#071016d9",
  BORDER = "#31544d";
export type Box = { x: number; y: number; w: number; h: number };

export function write(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  weight = 600,
  align: CanvasTextAlign = "center",
) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function panel(
  ctx: CanvasRenderingContext2D,
  box: Box,
  fill = SCRIM,
  stroke: string | null = BORDER,
) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(box.x, box.y, box.w, box.h, 6);
  else ctx.rect(box.x, box.y, box.w, box.h);
  ctx.fillStyle = fill;
  ctx.fill();
  if (!stroke) return;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
}

// The bar's three readouts as text. They are rebuilt only when a number
// changes, not on every drawn frame.
const shown = { left: -1, score: -1, combo: -1, time: "", points: "", run: "" };
const bar: Box = { x: 0, y: 46, w: 0, h: 56 };

/** Time, score and combo, centred under the stage's own badges. */
export function drawScoreBar(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  round: Round,
) {
  const left = secondsLeft(round),
    playing = round.phase === "playing";
  if (left !== shown.left) {
    shown.left = left;
    shown.time = `0:${String(left).padStart(2, "0")}`;
  }
  if (round.score !== shown.score) {
    shown.score = round.score;
    shown.points = round.score.toLocaleString("en-US");
  }
  if (round.combo !== shown.combo) {
    const times = multiplier(round.combo);
    shown.combo = round.combo;
    shown.run = times > 1 ? `${round.combo} · x${times}` : `${round.combo}`;
  }
  bar.w = Math.min(330, frame.width - 120);
  bar.x = (frame.width - bar.w) / 2;
  panel(ctx, bar);
  const cell = bar.w / 3,
    labels = bar.y + 15,
    values = bar.y + 36;
  write(ctx, "TIME", bar.x + cell * 0.5, labels, 10, MUTED);
  write(ctx, "SCORE", bar.x + cell * 1.5, labels, 10, MUTED);
  write(ctx, "COMBO", bar.x + cell * 2.5, labels, 10, MUTED);
  if (frame.paused)
    write(ctx, "Paused", bar.x + cell * 0.5, values, 14, INK, 700);
  else write(ctx, shown.time, bar.x + cell * 0.5, values, 21, INK, 700);
  write(ctx, shown.points, bar.x + cell * 1.5, values, 21, INK, 700);
  write(ctx, shown.run, bar.x + cell * 2.5, values, 21, MINT, 700);
  // The round clock as a bar along the bottom edge of the panel.
  ctx.fillStyle = left <= 5 && playing ? ROSE : MINT;
  ctx.fillRect(
    bar.x + 1,
    bar.y + bar.h - 3,
    (bar.w - 2) * (playing ? 1 - round.clock / round.roundMs : 1),
    2,
  );
}

/** The mute button: a speaker, crossed out while muted. */
export function drawMute(
  ctx: CanvasRenderingContext2D,
  box: Box,
  muted: boolean,
) {
  const x = box.x + box.w / 2 - 7,
    y = box.y + box.h / 2;
  panel(ctx, box);
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 3);
  ctx.lineTo(x, y - 3);
  ctx.lineTo(x + 5, y - 8);
  ctx.lineTo(x + 5, y + 8);
  ctx.lineTo(x, y + 3);
  ctx.lineTo(x - 4, y + 3);
  ctx.closePath();
  ctx.fillStyle = muted ? MUTED : MINT;
  ctx.fill();
  ctx.beginPath();
  if (muted) {
    ctx.moveTo(x + 10, y - 5);
    ctx.lineTo(x + 19, y + 5);
    ctx.moveTo(x + 19, y - 5);
    ctx.lineTo(x + 10, y + 5);
  } else {
    ctx.arc(x + 6, y, 6, -0.9, 0.9);
    ctx.moveTo(x + 6 + 11 * Math.cos(-0.9), y + 11 * Math.sin(-0.9));
    ctx.arc(x + 6, y, 11, -0.9, 0.9);
  }
  ctx.strokeStyle = muted ? ROSE : MINT;
  ctx.lineWidth = 1.75;
  ctx.stroke();
}

/** A short line of guidance, a label or a warning in its own small panel. */
export function drawNote(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  text: string,
  y: number,
  color = INK,
  /** Left edge. Centred on the stage when omitted. */
  left?: number,
) {
  ctx.font = `600 13px ${FONT}`;
  const w = ctx.measureText(text).width + 28,
    x = left ?? (frame.width - w) / 2;
  panel(ctx, { x, y: y - 15, w, h: 30 });
  write(ctx, text, x + w / 2, y + 1, 13, color);
}
