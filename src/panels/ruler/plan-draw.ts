/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Canvas drawing of the top-down view from layout primitives.
import type { Prim } from "./plan-layout";

export function drawPrims(ctx: CanvasRenderingContext2D, prims: Prim[]) {
  for (const p of prims) {
    if (p.t === "line") {
      ctx.strokeStyle = p.color;
      ctx.lineWidth = p.width;
      ctx.beginPath();
      p.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (p.closed) ctx.closePath();
      ctx.stroke();
    } else if (p.t === "dot") {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.font = `600 ${p.size}px system-ui, sans-serif`;
      ctx.textAlign =
        p.anchor === "middle"
          ? "center"
          : p.anchor === "end"
            ? "right"
            : "left";
      // A dark halo keeps labels readable over the photo.
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0b1214";
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
  }
  ctx.textAlign = "left";
}
