/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Each room picture's pixels for the plan, decoded once from the bytes held
// in memory and kept while the picture is in the room. At most 1200 pixels on
// a side each, so four phone photos stay small.
import type { Raster } from "../topdown";
import { rasterOf } from "./picture";
import type { View } from "./views-store";

type Pixels = { raster: Raster; scale: number };
const cache = new Map<number, { blob: Blob; pixels: Pixels | null }>(),
  listeners = new Set<() => void>();
let version = 0;

export const subscribeRasters = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Goes up by one each time a picture's pixels arrive. */
export const rasterVersion = () => version;

/** The view's pixels, or null while they are being read (a listener is told
 * when they arrive) or when it has no picture. */
export function pixelsOf(view: View): Pixels | null {
  const { id, blob } = view;
  if (!blob) return null;
  const hit = cache.get(id);
  if (hit && hit.blob === blob) return hit.pixels;
  cache.set(id, { blob, pixels: null });
  void rasterOf(blob).then((pixels) => {
    if (cache.get(id)?.blob !== blob || !pixels) return;
    cache.set(id, { blob, pixels });
    version++;
    listeners.forEach((l) => l());
  });
  return null;
}
/** How many pictures' pixels are held (tests). */
export const heldPixels = () => cache.size;
/** Let go of pixels of pictures no longer in the room. */
export function keepOnly(ids: readonly number[]) {
  for (const id of cache.keys()) if (!ids.includes(id)) cache.delete(id);
}
