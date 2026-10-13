/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Draws one picture's labels and boxes on the canvas laid over it. Nothing is
// drawn into the photograph itself, which is shown unchanged.
import type { Box } from "./iou";
import type { Label } from "./match";
import type { PicturePoint } from "./operating-point";

/** Line colour and dash for each thing in the legend. The list under the
 * picture says the same in words. */
export const STYLE = {
  hit: { color: "#3ddc84", dash: [] as number[] },
  miss: { color: "#ffb000", dash: [10, 6] },
  false: { color: "#ff5a5f", dash: [] as number[] },
  crowd: { color: "#9aa0a6", dash: [3, 5] },
};

/** Draw the crowd regions, then every counted item, in source pixels. The
 * canvas takes the picture's own size; the page scales both together. */
export function drawScore(
  canvas: HTMLCanvasElement,
  size: { width: number; height: number },
  labels: readonly Label[],
  point: PicturePoint,
) {
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.lineWidth = Math.max(2, size.width / 240);
  const stroke = (box: Box, style: { color: string; dash: number[] }) => {
    ctx.strokeStyle = style.color;
    ctx.setLineDash(style.dash);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  };
  for (const label of labels) if (label.crowd) stroke(label.box, STYLE.crowd);
  for (const item of point.items)
    if (item.kind !== "ignored") stroke(item.box, STYLE[item.kind]);
}
