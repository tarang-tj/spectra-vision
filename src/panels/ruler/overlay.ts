/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the Ruler draws on the stage canvas: the reference outline, measuring
// lines with their results, draggable handles and the loupe. It is drawn on
// the one stage canvas, so Screenshot and Record capture it.
import type { Frame } from "../../vision/frame";
import { derive } from "./derive";
import { orderCorners, type Pt } from "./homography";
import { bindSource, clear, getState } from "./store";

const REF = "#ffd18d";
const LINE = "#a4ffd9";
const INK = "#0b1214";
const FONT = "600 12px system-ui, sans-serif";

/** Shared between the overlay and the pointer code. */
export const view = {
  /** The shown source is a still picture, or the stage is paused. */
  still: true,
  /** The source is a video or camera (its points cannot outlive a freeze). */
  video: false,
  /** The point being placed or dragged, in source pixels and canvas pixels. */
  loupe: null as { at: Pt; canvas: { x: number; y: number } } | null,
};

const sizeOf = (el: HTMLImageElement | HTMLVideoElement) =>
  el instanceof HTMLVideoElement
    ? { w: el.videoWidth, h: el.videoHeight }
    : { w: el.naturalWidth, h: el.naturalHeight };

function dot(
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

function tag(
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

function loupe(ctx: CanvasRenderingContext2D, frame: Frame) {
  const l = view.loupe,
    el = frame.source?.element;
  if (!l || !el) return;
  const R = 52,
    half = 12,
    cx = Math.min(frame.width - R - 4, Math.max(R + 4, l.canvas.x)),
    below = l.canvas.y < R * 2 + 70,
    cy = below ? l.canvas.y + R + 60 : l.canvas.y - R - 60;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = INK;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(cx, cy);
  if (frame.mirror) ctx.scale(-1, 1);
  try {
    ctx.drawImage(
      el,
      l.at.x - half,
      l.at.y - half,
      half * 2,
      half * 2,
      -R,
      -R,
      R * 2,
      R * 2,
    );
  } catch {
    /* The source is not drawable this instant; show the empty loupe. */
  }
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.moveTo(cx - 14, cy);
  ctx.lineTo(cx + 14, cy);
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx, cy + 14);
  ctx.stroke();
}

export function drawRuler(ctx: CanvasRenderingContext2D, frame: Frame) {
  const el = frame.source?.element;
  if (!frame.source || !el) return;
  const { w, h } = sizeOf(el);
  if (!w || !h || !frame.rect.w) return;
  bindSource(frame.source.generation, w, h, frame.rect.w / w);
  view.still = frame.paused || el instanceof HTMLImageElement;
  // Points belong to a frozen picture; on a moving one they would mislead.
  view.video = el instanceof HTMLVideoElement;
  if (!view.still) {
    // Points belong to one frozen frame. Once a video moves on they describe
    // a picture that is gone, so they and their results are dropped.
    if (view.video && (getState().corners.length || getState().measures.length))
      clear();
    return;
  }
  const s = getState(),
    d = derive(s),
    at = (p: Pt) => frame.project({ x: p.x / w, y: p.y / h });

  if (s.corners.length) {
    const ring = d.sheet
      ? d.sheet.ordered
      : s.corners.length === 4
        ? orderCorners(s.corners)
        : s.corners;
    ctx.strokeStyle = REF;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ring.forEach((p, i) => {
      const c = at(p);
      if (i) ctx.lineTo(c.x, c.y);
      else ctx.moveTo(c.x, c.y);
    });
    if (ring.length === 4) ctx.closePath();
    ctx.stroke();
    if (d.sheet && d.reference) {
      // Name each edge's assumed length so a wrong long/short guess shows.
      const [p0, p1, p2] = d.sheet.plane;
      [
        [0, 1, p1.x - p0.x],
        [1, 2, p2.y - p1.y],
      ].forEach(([i, j, mm]) => {
        const a = at(d.sheet!.ordered[i]),
          b = at(d.sheet!.ordered[j]);
        tag(
          ctx,
          `${Number(mm.toFixed(1))} mm`,
          (a.x + b.x) / 2 - 20,
          (a.y + b.y) / 2,
          REF,
        );
      });
    }
    s.corners.forEach((p, i) => {
      const c = at(p);
      dot(ctx, c.x, c.y, REF, String(i + 1));
    });
  }

  s.measures.forEach((m, i) => {
    const a = at(m.a);
    if (m.b) {
      const b = at(m.b);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      dot(ctx, b.x, b.y, LINE, "");
      const row = d.rows.find((r) => r.index === i);
      tag(
        ctx,
        row ? row.text : "needs the reference",
        (a.x + b.x) / 2 + 6,
        (a.y + b.y) / 2 - 8,
        LINE,
      );
    }
    dot(ctx, a.x, a.y, LINE, "");
  });
  loupe(ctx, frame);
}
