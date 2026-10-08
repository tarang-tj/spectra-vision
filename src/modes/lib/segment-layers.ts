/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { SegmentExtra } from "../../vision/types";

// Turns one segmentation result into small canvases the mode can scale onto
// the stage. They are rebuilt once per model result (or when the view
// changes), never per drawn frame: a drawn frame costs two drawImage calls.

/** Display name and colour of each class the multiclass selfie model reports. */
export const SEGMENT_CLASSES: Record<
  string,
  { name: string; color: string; rgb: [number, number, number] }
> = {
  background: { name: "Background", color: "#b1bec3", rgb: [177, 190, 195] },
  hair: { name: "Hair", color: "#ae94fa", rgb: [174, 148, 250] },
  "body-skin": { name: "Body skin", color: "#ffd18d", rgb: [255, 209, 141] },
  "face-skin": { name: "Face skin", color: "#ff8ab4", rgb: [255, 138, 180] },
  clothes: { name: "Clothes", color: "#67aaff", rgb: [103, 170, 255] },
  others: { name: "Accessories", color: "#a4ffd9", rgb: [164, 255, 217] },
};
const FALLBACK = { color: "#a4ffd9", rgb: [164, 255, 217] as const };
export const classInfo = (label: string) =>
  SEGMENT_CLASSES[label] ?? { name: label, ...FALLBACK };

export type SegmentView = {
  /** Class index to tint, or null. */
  tint: number | null;
  /** Blur the background instead of darkening it. */
  blur: boolean;
};
export type SegmentLayers = {
  /** Mask-sized. The darkened background plus the tinted class; in the blur
   * view, the blurred source with the person cut out of it. */
  cover: HTMLCanvasElement;
  /** Mask-sized glowing outline of the person. */
  outline: HTMLCanvasElement;
};

// Stage background, and how strongly it covers what is not the person.
const DARK = [9, 14, 17],
  DIM = 0.9,
  TINT_ALPHA = 150,
  OUTLINE = [164, 255, 217],
  EDGE_GAIN = 1.4;

// How the raw matte is shown: confidence under 30% reads as background, over
// 70% as person, with a smooth step between. It keeps faint, uncertain patches
// of a plain wall from showing up as haze. Shares and scores stay raw.
const CURVE = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const t = Math.min(1, Math.max(0, (i / 255 - 0.3) / 0.4));
  CURVE[i] = Math.round(t * t * (3 - 2 * t) * 255);
}

type Surface = { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D };
let cover: Surface | null = null,
  outline: Surface | null = null,
  line: Surface | null = null,
  pixels: ImageData | null = null,
  built: { extra: SegmentExtra; tint: number | null; blur: boolean } | null =
    null;

function surface(old: Surface | null, width: number, height: number): Surface {
  if (old && old.canvas.width === width && old.canvas.height === height)
    return old;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable.");
  return { canvas, ctx };
}

/** Layers for this result and view. The same canvases come back until the
 * result or the view changes. `source` is only read in the blur view. */
export function segmentLayers(
  extra: SegmentExtra,
  view: SegmentView,
  source: CanvasImageSource | null,
): SegmentLayers {
  const { width, height, mask, alpha } = extra;
  if (mask.length !== width * height || alpha.length !== mask.length)
    throw new Error("Segmentation mask has an unexpected size.");
  cover = surface(cover, width, height);
  outline = surface(outline, width, height);
  line = surface(line, width, height);
  if (
    built &&
    built.extra === extra &&
    built.tint === view.tint &&
    built.blur === view.blur
  )
    return { cover: cover.canvas, outline: outline.canvas };
  if (!pixels || pixels.width !== width || pixels.height !== height)
    pixels = new ImageData(width, height);
  const data = pixels.data,
    tint =
      view.tint === null ? null : classInfo(extra.classes[view.tint].label);

  // Pass 1: the person matte (blur view) or the dark cover with the tint.
  for (let i = 0, o = 0; i < mask.length; i++, o += 4) {
    if (view.blur) {
      data[o] = data[o + 1] = data[o + 2] = 0;
      data[o + 3] = CURVE[alpha[i]];
    } else if (tint && mask[i] === view.tint) {
      data[o] = tint.rgb[0];
      data[o + 1] = tint.rgb[1];
      data[o + 2] = tint.rgb[2];
      data[o + 3] = TINT_ALPHA;
    } else {
      data[o] = DARK[0];
      data[o + 1] = DARK[1];
      data[o + 2] = DARK[2];
      data[o + 3] = (255 - CURVE[alpha[i]]) * DIM;
    }
  }
  if (view.blur && source) {
    // The source, blurred at mask size, with the person cut out of it. The
    // line canvas holds the matte for a moment; pass 2 redraws it.
    line.ctx.putImageData(pixels, 0, 0);
    const c = cover.ctx;
    c.globalCompositeOperation = "copy";
    c.filter = "blur(3px)";
    c.drawImage(source, 0, 0, width, height);
    c.filter = "none";
    c.globalCompositeOperation = "destination-out";
    c.drawImage(line.canvas, 0, 0);
    c.globalCompositeOperation = "source-over";
  } else cover.ctx.putImageData(pixels, 0, 0);

  // Pass 2: the silhouette edge, as strong as the matte changes across the
  // pixel. The model's own soft boundary keeps the line from stair-stepping.
  for (let y = 0, i = 0, o = 0; y < height; y++)
    for (let x = 0; x < width; x++, i++, o += 4) {
      const dx =
          CURVE[alpha[x + 1 < width ? i + 1 : i]] -
          CURVE[alpha[x > 0 ? i - 1 : i]],
        dy =
          CURVE[alpha[y + 1 < height ? i + width : i]] -
          CURVE[alpha[y > 0 ? i - width : i]];
      data[o] = OUTLINE[0];
      data[o + 1] = OUTLINE[1];
      data[o + 2] = OUTLINE[2];
      data[o + 3] = Math.min(255, Math.hypot(dx, dy) * EDGE_GAIN);
    }
  line.ctx.putImageData(pixels, 0, 0);
  const g = outline.ctx;
  g.clearRect(0, 0, width, height);
  g.filter = "blur(1.6px)";
  g.drawImage(line.canvas, 0, 0);
  g.filter = "none";
  g.drawImage(line.canvas, 0, 0);
  built = { extra, tint: view.tint, blur: view.blur };
  return { cover: cover.canvas, outline: outline.canvas };
}
