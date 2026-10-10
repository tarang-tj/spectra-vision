/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Further references on the stage: a dashed outline (the first reference's is
// solid), a name, and a numbered handle on each corner.
import { orderCorners, type Pt } from "./homography";
import { isCompact } from "./overlay-labels";
import { dot, REF, tag } from "./overlay-parts";
import type { RulerState } from "./state";

export function drawRefs(
  ctx: CanvasRenderingContext2D,
  s: RulerState,
  at: (p: Pt) => { x: number; y: number },
) {
  s.extraRefs.forEach((ref, r) => {
    if (!ref.corners.length) return;
    const ring = (
      ref.corners.length === 4 ? orderCorners(ref.corners) : ref.corners
    ).map(at);
    ctx.save();
    ctx.strokeStyle = REF;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ring.forEach((c, i) => (i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)));
    if (ring.length === 4) ctx.closePath();
    ctx.stroke();
    ctx.restore();
    // The name sits above the reference's highest corner, clear of the
    // corner numbers, which give way to it (see overlay-labels.ts).
    const top = ring.reduce((a, b) => (b.y < a.y ? b : a));
    tag(
      `${isCompact() ? "Ref" : "Reference"} ${r + 2}`,
      top.x - 20,
      top.y - 24,
      REF,
      "optional",
    );
    const rank = ref.corners.length === 4 ? "detail" : "optional";
    ref.corners.forEach((p, i) => {
      const c = at(p);
      dot(ctx, c.x, c.y, REF, String(i + 1), rank);
    });
  });
}
