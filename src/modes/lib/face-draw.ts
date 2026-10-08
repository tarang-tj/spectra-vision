/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Frame } from "../../vision/frame";
import type { Point } from "../../vision/types";
import {
  FACE_CONTOURS,
  FACE_IRISES,
  FACE_POINTS,
  FACE_TESSELATION,
  IRIS_CENTERS,
} from "./face-topology";
import type { Edges } from "./face-topology";

// Projected landmarks of the face being drawn. One buffer is reused for every
// face and frame: projecting 478 points through frame.project would allocate
// 478 objects per face, thirty times a second.
const xy = new Float32Array(FACE_POINTS * 2);

function trace(ctx: CanvasRenderingContext2D, edges: Edges, count: number) {
  ctx.beginPath();
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i],
      b = edges[i + 1];
    if (a >= count || b >= count) continue;
    ctx.moveTo(xy[a * 2], xy[a * 2 + 1]);
    ctx.lineTo(xy[b * 2], xy[b * 2 + 1]);
  }
}

/** Draw one face from its landmarks: an optional faint tesselation, glowing
 * contours (lips, eyes, brows, face oval) and the irises. Each layer is one
 * path and one stroke, so the glow is paid once per layer, not once per edge. */
export function drawFace(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  points: Point[],
  color: string,
  mesh: boolean,
) {
  const count = Math.min(points.length, FACE_POINTS),
    { rect, mirror } = frame;
  if (count < 2) return;
  for (let i = 0; i < count; i++) {
    const p = points[i];
    xy[i * 2] = rect.x + (mirror ? 1 - p.x : p.x) * rect.w;
    xy[i * 2 + 1] = rect.y + p.y * rect.h;
  }
  if (mesh) {
    trace(ctx, FACE_TESSELATION, count);
    ctx.strokeStyle = `${color}55`;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
  trace(ctx, FACE_CONTOURS, count);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.shadowColor = color;
  ctx.shadowBlur = 9;
  ctx.stroke();
  // The iris landmarks exist only in the 478-point model output.
  if (count > IRIS_CENTERS[1]) {
    trace(ctx, FACE_IRISES, count);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    for (const center of IRIS_CENTERS) {
      ctx.beginPath();
      ctx.arc(xy[center * 2], xy[center * 2 + 1], 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
}
