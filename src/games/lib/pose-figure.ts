/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Draws Mirror's target pose as a thick outline anchored on the player's own
// shoulders, so "fit into the outline" is literal. Each limb turns mint as
// its joint comes within reach of the target.
import type { Frame } from "../../vision/frame";
import type { Point } from "../../vision/types";
import { MINT } from "./hud";
import { layoutPose } from "./pose-layout";

const LAVENDER = "#ae94fa";
const figure = new Float32Array(24);

export function drawFigure(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  body: Point[] | undefined,
  angles: ArrayLike<number>,
  /** Per-joint score 0..1, or -1 for a joint that could not be judged. */
  scores: ArrayLike<number>,
  hold: number,
  flash: boolean,
) {
  const { rect, mirror } = frame,
    left = body?.[11],
    right = body?.[12],
    anchored =
      !!left &&
      !!right &&
      (left.visibility ?? 1) > 0.4 &&
      (right.visibility ?? 1) > 0.4;
  // Shoulder midpoint and width in canvas pixels; a default stance when no
  // body is tracked, so the target is visible before the player steps in.
  let cx = rect.x + rect.w / 2,
    cy = rect.y + rect.h * 0.34,
    unit = rect.h * 0.16;
  if (anchored) {
    const mx = (left.x + right.x) / 2;
    cx = rect.x + (mirror ? 1 - mx : mx) * rect.w;
    cy = rect.y + ((left.y + right.y) / 2) * rect.h;
    unit = Math.max(
      rect.h * 0.1,
      Math.hypot((left.x - right.x) * rect.w, (left.y - right.y) * rect.h),
    );
  }
  layoutPose(angles, 0, 0, unit, figure);
  // On a mirrored stage the player's left is on the viewer's left.
  const side = mirror ? -1 : 1,
    X = (i: number) => cx + side * figure[i * 2],
    Y = (i: number) => cy + figure[i * 2 + 1];
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = flash ? 0.95 : 0.6;
  // Torso and head: the frame the limbs hang from.
  ctx.beginPath();
  ctx.moveTo(X(0), Y(0));
  ctx.lineTo(X(3), Y(3));
  ctx.lineTo(X(9), Y(9));
  ctx.lineTo(X(6), Y(6));
  ctx.closePath();
  ctx.fillStyle = flash ? "#ffffff66" : "#f3f7f622";
  ctx.fill();
  ctx.strokeStyle = flash ? "#ffffff" : "#f3f7f688";
  ctx.lineWidth = 2;
  ctx.stroke();
  const headY = cy - unit * 0.78,
    headR = unit * 0.36;
  ctx.beginPath();
  ctx.arc(cx, headY, headR, 0, Math.PI * 2);
  ctx.stroke();
  for (let limb = 0; limb < 4; limb++) {
    for (let part = 0; part < 2; part++) {
      const score = scores[limb * 2 + part],
        from = limb * 3 + part,
        color = flash ? "#ffffff" : score >= 0.7 ? MINT : LAVENDER;
      ctx.beginPath();
      ctx.moveTo(X(from), Y(from));
      ctx.lineTo(X(from + 1), Y(from + 1));
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 14;
      // Legs the model cannot see are drawn thin: they are not being judged.
      ctx.lineWidth = unit * (score < 0 ? 0.06 : 0.2);
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  // The hold ring fills around the head while the pose matches.
  if (hold > 0) {
    ctx.beginPath();
    ctx.arc(
      cx,
      headY,
      headR + 7,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * hold,
    );
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  ctx.restore();
}
