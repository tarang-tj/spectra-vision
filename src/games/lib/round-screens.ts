/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// The two full-stage screens of a round, drawn on the canvas: the 3-2-1
// start and the result card. Both shrink to fit a small (phone) stage.
import type { Frame } from "../../vision/frame";
import { AMBER, INK, MINT, MUTED, panel, write } from "./hud";
import type { Box } from "./hud";
import { countdownNumber } from "./round";
import type { Round } from "./round";

// The result card is designed at this size and scaled down when needed.
const CARD_W = 420,
  CARD_H = 286,
  BUTTON: Box = { x: 24, y: 208, w: CARD_W - 48, h: 46 };

/** 1 on a desktop stage, down to 0.58 on the smallest phone stage. */
export function stageScale(frame: Frame) {
  return Math.max(
    0.58,
    Math.min(1, (frame.width - 24) / CARD_W, frame.height / 470),
  );
}

/** The 3-2-1 start: what the game is, how to play, and the number. */
export function drawCountdown(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  round: Round,
  title: string,
  howTo: string,
) {
  ctx.fillStyle = "#07101699";
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.save();
  ctx.translate(frame.width / 2, frame.height / 2 + 14);
  ctx.scale(stageScale(frame), stageScale(frame));
  write(ctx, title.toUpperCase(), 0, -118, 15, MINT, 700);
  write(ctx, howTo, 0, -92, 17, INK, 500);
  write(ctx, String(countdownNumber(round)), 0, 6, 92, INK, 700);
  // A ring that empties over each second (held full under reduced motion).
  const share = frame.animate ? 1 - (round.clock % 1000) / 1000 : 1;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 68, 0, Math.PI * 2);
  ctx.strokeStyle = "#a4ffd933";
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, 68, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * share);
  ctx.strokeStyle = MINT;
  ctx.stroke();
  ctx.restore();
}

/** Where the result card and its Play again button sit, in canvas pixels.
 * The same boxes place the real button and test the hold-to-press. */
export function resultLayout(frame: Frame, card: Box, button: Box) {
  const k = stageScale(frame);
  card.w = CARD_W * k;
  card.h = CARD_H * k;
  card.x = (frame.width - card.w) / 2;
  card.y = Math.max(42, (frame.height - card.h) / 2 - 14 * k);
  button.x = card.x + BUTTON.x * k;
  button.y = card.y + BUTTON.y * k;
  button.w = BUTTON.w * k;
  button.h = BUTTON.h * k;
}

/** The result card. `rows` are label and value pairs measured in the round;
 * `dwell` (0..1) is how far a held hand has pressed Play again. */
export function drawResult(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  round: Round,
  title: string,
  rows: readonly (readonly [string, string])[],
  best: number,
  card: Box,
  dwell: number,
) {
  const cx = CARD_W / 2,
    record = round.score >= best && round.score > 0;
  ctx.fillStyle = "#071016aa";
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.save();
  ctx.translate(card.x, card.y);
  ctx.scale(card.w / CARD_W, card.w / CARD_W);
  panel(ctx, { x: 0, y: 0, w: CARD_W, h: CARD_H }, "#0b1418f2");
  write(ctx, `${title.toUpperCase()} · ROUND OVER`, cx, 28, 12, MINT, 700);
  write(ctx, round.score.toLocaleString("en-US"), cx, 76, 54, INK, 700);
  write(
    ctx,
    record
      ? "New best this visit"
      : `Best this visit ${best.toLocaleString("en-US")}`,
    cx,
    118,
    13,
    record ? AMBER : MUTED,
  );
  rows.forEach(([name, value], i) => {
    const x = (CARD_W / rows.length) * (i + 0.5);
    write(ctx, value, x, 154, 19, INK, 700);
    write(ctx, name.toUpperCase(), x, 176, 10, MUTED);
  });
  panel(ctx, BUTTON, MINT, null);
  if (dwell > 0) {
    ctx.fillStyle = "#3fd9a4";
    ctx.fillRect(BUTTON.x, BUTTON.y, BUTTON.w * Math.min(1, dwell), BUTTON.h);
  }
  write(ctx, "Play again", cx, BUTTON.y + BUTTON.h / 2 + 1, 16, "#07221a", 700);
  write(
    ctx,
    "Click it, or hold a hand over it",
    cx,
    CARD_H - 16,
    12,
    MUTED,
    500,
  );
  ctx.restore();
}
