/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { strokePath } from "../../vision/draw";
import { HAND_EDGES } from "../../vision/geometry";
import type { Frame } from "../../vision/frame";
import type { Point } from "../../vision/types";

/** A filled label chip in the style of the object boxes: dark text on the
 * item's colour, kept inside the image. `x`, `y` are canvas pixels of the
 * chip's top-left corner before clamping. */
export function drawChip(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  const { rect } = frame;
  ctx.font = "600 12px Inter Variable, sans-serif";
  const width = ctx.measureText(text).width + 14,
    left = Math.min(Math.max(x, rect.x), rect.x + rect.w - width),
    top = Math.min(Math.max(y, rect.y + 8), rect.y + rect.h - 31);
  ctx.fillStyle = color;
  ctx.fillRect(left, top, width, 23);
  ctx.fillStyle = "#07130e";
  ctx.fillText(text, left + 7, top + 16);
}

/** One hand as the Hands mode draws it: glowing bones, a dot per joint, larger
 * thumb and index tips. Lines and dots shrink with the hand so that a small,
 * distant hand stays a hand and not a blob. Hand landmarks report a visibility
 * of zero, so visibility is never used as a filter. */
export function drawHand(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  landmarks: Point[],
  color: string,
) {
  // Palm length on the canvas (wrist to middle knuckle) sets the scale.
  const wrist = landmarks[0],
    knuckle = landmarks[9];
  let scale = 1;
  if (wrist && knuckle) {
    const a = frame.project(wrist),
      b = frame.project(knuckle);
    scale = Math.min(1, Math.max(0.25, Math.hypot(a.x - b.x, a.y - b.y) / 70));
  }
  for (const [a, b] of HAND_EDGES)
    if (landmarks[a] && landmarks[b])
      strokePath(
        ctx,
        frame,
        [landmarks[a], landmarks[b]],
        color,
        2.5 * scale,
        9 * scale,
      );
  ctx.shadowColor = color;
  ctx.shadowBlur = 10 * scale;
  landmarks.forEach((p, i) => {
    const q = frame.project(p);
    ctx.beginPath();
    ctx.arc(q.x, q.y, (i === 4 || i === 8 ? 5 : 3) * scale, 0, Math.PI * 2);
    ctx.fillStyle = i === 8 ? "#ffffff" : color;
    ctx.fill();
  });
  ctx.shadowBlur = 0;
}
