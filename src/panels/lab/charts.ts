/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Canvas charts for the lab, in the studio's own language: thin 1 px rules on
// the dark surface, mint for the measured line, blue and lavender for guides,
// and no glow (glow is reserved for model-driven geometry on the stage).
// Every point drawn is a measured sample; nothing is interpolated or smoothed.
import type { Samples } from "./lab-store";

export const CHART = {
  line: "#a4ffd9",
  second: "#67aaff",
  third: "#ae94fa",
  rule: "#31544d",
  text: "#b1bec3",
};
const PAD = { left: 4, right: 4, top: 14, bottom: 14 },
  FONT = '500 10px "Inter Variable", Inter, system-ui, sans-serif';

export type Guide = { value: number; color: string };
export type Series = { samples: Samples; color: string };
export type ChartSpec = {
  series: Series[];
  guides: Guide[];
  /** The time axis covers [now - spanMs, now]. */
  now: number;
  spanMs: number;
  unit: string;
};

/** Round a maximum up to a tidy axis top (1, 2 or 5 times a power of ten). */
export function axisTop(max: number): number {
  if (!(max > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(max)),
    scaled = max / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

/** Match the backing store to the element's CSS size. Returns CSS pixels. */
function fit(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const dpr = Math.min(2, devicePixelRatio || 1),
    width = canvas.clientWidth,
    height = canvas.clientHeight,
    pw = Math.round(width * dpr),
    ph = Math.round(height * dpr);
  // Assigning a canvas size clears it, so only do it when the size changed.
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height };
}

/** Draw one time chart. Called by the lab a few times a second while open. */
export function drawChart(canvas: HTMLCanvasElement | null, spec: ChartSpec) {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return;
  try {
    const { width, height } = fit(canvas, ctx),
      w = width - PAD.left - PAD.right,
      h = height - PAD.top - PAD.bottom;
    if (w <= 0 || h <= 0) return;
    let max = 0;
    for (const { samples } of spec.series)
      for (let i = 0; i < samples.values.length; i++)
        if (samples.values[i] > max) max = samples.values[i];
    const top = axisTop(max),
      x = (time: number) =>
        PAD.left + w * (1 - (spec.now - time) / spec.spanMs),
      y = (value: number) => PAD.top + h * (1 - Math.min(value, top) / top);

    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 1;
    ctx.strokeStyle = CHART.rule;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top + 0.5);
    ctx.lineTo(PAD.left + w, PAD.top + 0.5);
    ctx.moveTo(PAD.left, PAD.top + h + 0.5);
    ctx.lineTo(PAD.left + w, PAD.top + h + 0.5);
    ctx.stroke();

    ctx.setLineDash([3, 3]);
    for (const guide of spec.guides) {
      if (!Number.isFinite(guide.value)) continue;
      ctx.strokeStyle = guide.color;
      ctx.beginPath();
      ctx.moveTo(PAD.left, y(guide.value));
      ctx.lineTo(PAD.left + w, y(guide.value));
      ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    for (const { samples, color } of spec.series) {
      const n = samples.values.length;
      if (!n) continue;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      // A single sample has no line to draw: show it as a dot.
      if (n === 1) {
        ctx.fillRect(x(samples.times[0]) - 1, y(samples.values[0]) - 1, 3, 3);
        continue;
      }
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = x(samples.times[i]),
          py = y(samples.values[i]);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }

    ctx.font = FONT;
    ctx.fillStyle = CHART.text;
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(`${top} ${spec.unit}`, PAD.left, 1);
    ctx.textBaseline = "bottom";
    ctx.fillText(`${spec.spanMs / 1000} s ago`, PAD.left, height);
    ctx.textAlign = "right";
    ctx.fillText("now", PAD.left + w, height);
  } catch (error) {
    // A chart must never take the panel down with it.
    console.error("[spectra lab] chart failed", error);
  }
}
