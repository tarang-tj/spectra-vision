/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A copy of the frozen picture, taken once when the Ruler sees it still. The
// top-down view reads from the copy, so a camera that keeps running behind a
// paused stage cannot change what the measurements were taken from.
import type { Raster } from "./topdown";

const MAX_SIDE = 1200;
export type Snapshot = {
  generation: number;
  /** Size relative to the real picture (at most 1). */
  scale: number;
  canvas: HTMLCanvasElement;
  /** Pixels, read on first use. */
  raster: Raster | null;
};

/** Copy `el` (`w` x `h` real pixels) down to at most 1200 px on a side. Null
 * when the browser cannot draw it. */
export function takeSnapshot(
  el: CanvasImageSource,
  w: number,
  h: number,
  generation: number,
): Snapshot | null {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  return { generation, scale, canvas, raster: null };
}

/** The snapshot's pixels, read once. Null if the canvas cannot be read. */
export function rasterOf(snap: Snapshot): Raster | null {
  if (snap.raster) return snap.raster;
  try {
    const { width, height } = snap.canvas,
      img = snap.canvas.getContext("2d")!.getImageData(0, 0, width, height);
    snap.raster = { data: img.data, w: width, h: height };
  } catch {
    return null;
  }
  return snap.raster;
}
