/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A room picture as bytes and as pixels. Everything here stays in memory: a
// picture is read from the stage or from a file the user chose, and nothing
// is sent anywhere.
import type { Raster } from "../plan/topdown";

const THUMB_SIDE = 160;
/** The merged plan reads each picture from a copy this size at most, the cap
 * the single-picture top-down view already uses. */
const COPY_SIDE = 1200;

function drawn(
  el: CanvasImageSource,
  w: number,
  h: number,
  maxSide: number,
): HTMLCanvasElement | null {
  const scale = Math.min(1, maxSide / Math.max(w, h)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  try {
    canvas.getContext("2d")!.drawImage(el, 0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  return canvas;
}

/** The bytes of what the stage shows: a photo's own file, or the frozen frame
 * of a video or camera as a PNG. Null when the browser cannot give them. */
export async function blobOfSource(
  el: HTMLImageElement | HTMLVideoElement,
): Promise<Blob | null> {
  try {
    if (el instanceof HTMLImageElement) {
      const blob = await (await fetch(el.currentSrc || el.src)).blob();
      return blob.type.startsWith("image/") ? blob : null;
    }
    const canvas = drawn(el, el.videoWidth, el.videoHeight, Infinity);
    if (!canvas) return null;
    return await new Promise((done) => canvas.toBlob(done, "image/png"));
  } catch {
    return null;
  }
}

/** A small JPEG of the picture for the strip, as a data URL. */
export async function thumbOf(blob: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(blob),
      canvas = drawn(bitmap, bitmap.width, bitmap.height, THUMB_SIDE);
    bitmap.close();
    return canvas ? canvas.toDataURL("image/jpeg", 0.7) : null;
  } catch {
    return null;
  }
}

/** The picture's pixels, at most 1200 on a side, and that copy's size
 * relative to the real picture. */
export async function rasterOf(
  blob: Blob,
): Promise<{ raster: Raster; scale: number } | null> {
  try {
    const bitmap = await createImageBitmap(blob),
      canvas = drawn(bitmap, bitmap.width, bitmap.height, COPY_SIDE),
      scale = canvas ? canvas.width / bitmap.width : 0;
    bitmap.close();
    if (!canvas) return null;
    const { width, height } = canvas,
      data = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
    return { raster: { data, w: width, h: height }, scale };
  } catch {
    return null;
  }
}
