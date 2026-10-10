/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the Ruler draws on the stage canvas: the reference outline, measuring
// lines with their results, draggable handles and the loupe. It is drawn on
// the one stage canvas, so Screenshot and Record capture it.
import type { Frame } from "../../vision/frame";
import { derive } from "./derive";
import { drawExtensions } from "./extensions";
import { orderCorners, type Pt } from "./homography";
import { beginLabels, flushLabels } from "./overlay-labels";
import { dot, INK, LINE, REF, tag } from "./overlay-parts";
import { drawRefs } from "./overlay-refs";
import { drawShapes } from "./overlay-shapes";
import { shortReading } from "./reading";
import { takeSnapshot, type Snapshot } from "./snapshot";
import { bindSource, bindStillness, getState } from "./store";

/** Shared between the overlay and the pointer code. */
export const view = {
  /** The shown source is a still picture, or the stage is paused. */
  still: true,
  /** The source is a video or camera (its points cannot outlive a freeze). */
  video: false,
  /** Copy of the frozen picture for the top-down view (null while moving). */
  snap: null as Snapshot | null,
  /** The point being placed or dragged, in source pixels and canvas pixels. */
  loupe: null as { at: Pt; canvas: { x: number; y: number } } | null,
};

/** The generation a snapshot was last tried for (reset when the picture moves). */
let snapTried: number | null = null;

/** Forget the copy of the picture (the panel closed). */
export function dropSnapshot() {
  view.snap = null;
  snapTried = null;
}

const sizeOf = (el: HTMLImageElement | HTMLVideoElement) =>
  el instanceof HTMLVideoElement
    ? { w: el.videoWidth, h: el.videoHeight }
    : { w: el.naturalWidth, h: el.naturalHeight };

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
  bindStillness(view.video, view.still);
  if (!view.still) {
    view.snap = null;
    snapTried = null;
    return;
  }
  // One copy per frozen picture; a copy that failed is not retried every frame.
  if (
    (!view.snap || view.snap.generation !== frame.source.generation) &&
    snapTried !== frame.source.generation
  ) {
    snapTried = frame.source.generation;
    view.snap = takeSnapshot(el, w, h, frame.source.generation);
  }
  const s = getState(),
    d = derive(s),
    at = (p: Pt) => frame.project({ x: p.x / w, y: p.y / h });
  beginLabels(frame.rect.w);

  if (s.corners.length) {
    const ring = d.sheet
      ? (d.sheet.raw ?? d.sheet.ordered)
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
        const ring = d.sheet!.raw ?? d.sheet!.ordered,
          a = at(ring[i]),
          b = at(ring[j]);
        tag(
          `${Number(mm.toFixed(1))} mm`,
          (a.x + b.x) / 2 - 20,
          (a.y + b.y) / 2,
          REF,
          "optional",
        );
      });
    }
    // The numbers count the taps; once all four are in they are a detail.
    const rank = s.corners.length === 4 ? "detail" : "optional";
    s.corners.forEach((p, i) => {
      const c = at(p);
      dot(ctx, c.x, c.y, REF, String(i + 1), rank);
    });
  }
  drawRefs(ctx, s, at);

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
        row ? shortReading(row.text) : "needs the reference",
        (a.x + b.x) / 2 + 6,
        (a.y + b.y) / 2 - 8,
        LINE,
      );
    }
    dot(ctx, a.x, a.y, LINE, "");
  });
  drawShapes(ctx, s, d, at);
  drawExtensions(ctx, frame, s, d, w, h);
  flushLabels(ctx, frame.width, frame.height);
  loupe(ctx, frame);
}
