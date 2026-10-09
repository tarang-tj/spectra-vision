/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Frame } from "../../vision/frame";
import type { Baseline } from "./calibration";
import type { FaceSample } from "./types";

/** Length of the drawn direction mark, as a fraction of the image height. */
const LENGTH = 0.09;
const RAD = Math.PI / 180;

/** Marks the head direction on the stage: a mint line from the nose for where the
 * head points now, a dashed blue line and a ring (the stated angle) for the
 * baseline. Both are the projection of a unit vector turned by yaw and pitch,
 * so a longer line means a head turned further from the camera. Only marks:
 * no colour changes when the head is inside or outside the ring. */
export function drawHeadMarks(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  face: FaceSample | null,
  baseline: Baseline | null,
  angle: number,
) {
  const nose = face?.nose;
  if (!face || !nose || frame.width <= 0) return;
  const tip = (yaw: number, pitch: number) =>
    frame.project({
      x: nose.x + (Math.sin(yaw * RAD) * LENGTH) / frame.aspect,
      y: nose.y - Math.sin(pitch * RAD) * LENGTH,
    });
  const from = frame.project(nose);
  ctx.lineWidth = 2;
  if (baseline?.face) {
    const base = tip(baseline.face.yaw, baseline.face.pitch);
    ctx.strokeStyle = "#67aaff";
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(base.x, base.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      base.x,
      base.y,
      Math.max(3, frame.rect.h * LENGTH * Math.sin(angle * RAD)),
      0,
      Math.PI * 2,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#67aaff";
    ctx.font = '500 11px "Inter Variable", Inter, system-ui, sans-serif';
    ctx.fillText("baseline", base.x + 6, base.y - 6);
  }
  const now = tip(face.yaw, face.pitch);
  ctx.strokeStyle = "#a4ffd9";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(now.x, now.y);
  ctx.stroke();
  ctx.fillStyle = "#a4ffd9";
  ctx.beginPath();
  ctx.arc(now.x, now.y, 3, 0, Math.PI * 2);
  ctx.fill();
}
