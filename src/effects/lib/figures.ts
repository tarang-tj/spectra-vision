/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { LineBatch } from "../../gl/lines";
import type { Rgb } from "../../gl/color";
import type { Frame } from "../../vision/frame";
import { HAND_EDGES, POSE_EDGES } from "../../vision/geometry";
import { handsOf, posesOf } from "./inputs";

/** A snapshot of the tracked skeletons (bodies, then hands) as flat numbers:
 * x, y in image-normalized space plus visibility. Flat and reused, so an
 * effect can keep a history of them without allocating per frame. */
export type FigureSet = {
  count: number;
  /** POSE or HAND per figure. */
  kinds: Uint8Array;
  data: Float32Array;
};
export const POSE = 0,
  HAND = 1;
const MAX_FIGURES = 4,
  MAX_POINTS = 33,
  STRIDE = 3,
  FIGURE_FLOATS = MAX_POINTS * STRIDE;

export const createFigureSet = (): FigureSet => ({
  count: 0,
  kinds: new Uint8Array(MAX_FIGURES),
  data: new Float32Array(MAX_FIGURES * FIGURE_FLOATS),
});

/** Copy the frame's bodies and hands into `out`. Hand landmarks report no
 * visibility, so they are stored as fully visible. */
export function captureFigures(frame: Frame, out: FigureSet) {
  out.count = 0;
  const poses = posesOf(frame),
    hands = handsOf(frame);
  for (let pass = 0; pass < 2; pass++) {
    const list = pass === 0 ? poses : hands,
      size = pass === 0 ? 33 : 21;
    for (let i = 0; i < list.length && out.count < MAX_FIGURES; i++) {
      const points = list[i];
      if (!points || points.length < size) continue;
      const base = out.count * FIGURE_FLOATS;
      for (let j = 0; j < size; j++) {
        const p = points[j];
        out.data[base + j * STRIDE] = p.x;
        out.data[base + j * STRIDE + 1] = p.y;
        out.data[base + j * STRIDE + 2] = pass === 0 ? (p.visibility ?? 1) : 1;
      }
      out.kinds[out.count++] = pass === 0 ? POSE : HAND;
    }
  }
}

export function copyFigures(from: FigureSet, to: FigureSet) {
  to.count = from.count;
  to.kinds.set(from.kinds);
  to.data.set(from.data);
}

const flat = (edges: number[][]) => Uint8Array.from(edges.flat());
const POSE_BONES = flat(POSE_EDGES),
  HAND_BONES = flat(HAND_EDGES);
// Silhouette capsules: joint a, joint b, radius in hundredths of the figure's
// own measure (shoulder width for a body, wrist to middle knuckle for a hand).
const POSE_SHAPE = Uint8Array.from(
  [
    [11, 23, 34],
    [12, 24, 34],
    [11, 24, 42],
    [12, 23, 42],
    [11, 12, 30],
    [23, 24, 34],
    [11, 13, 21],
    [12, 14, 21],
    [13, 15, 17],
    [14, 16, 17],
    [15, 19, 13],
    [16, 20, 13],
    [23, 25, 27],
    [24, 26, 27],
    [25, 27, 20],
    [26, 28, 20],
    [27, 31, 13],
    [28, 32, 13],
  ].flat(),
);
const HAND_SHAPE = Uint8Array.from(
  [
    [0, 9, 46],
    [5, 17, 30],
    [0, 5, 30],
    [0, 17, 30],
    [1, 2, 20],
    [2, 3, 17],
    [3, 4, 15],
    [5, 6, 17],
    [6, 7, 15],
    [7, 8, 14],
    [9, 10, 17],
    [10, 11, 15],
    [11, 12, 14],
    [13, 14, 16],
    [14, 15, 14],
    [15, 16, 13],
    [17, 18, 15],
    [18, 19, 13],
    [19, 20, 12],
  ].flat(),
);
const SEEN = 0.4;

// Pixel position of point j of figure f.
const fx = (frame: Frame, set: FigureSet, f: number, j: number) => {
  const x = set.data[f * FIGURE_FLOATS + j * STRIDE];
  return frame.rect.x + (frame.mirror ? 1 - x : x) * frame.rect.w;
};
const fy = (frame: Frame, set: FigureSet, f: number, j: number) =>
  frame.rect.y + set.data[f * FIGURE_FLOATS + j * STRIDE + 1] * frame.rect.h;
const seen = (set: FigureSet, f: number, j: number) =>
  set.data[f * FIGURE_FLOATS + j * STRIDE + 2] > SEEN;

/** A figure's own measure in CSS pixels: shoulder width of a body, wrist to
 * middle knuckle of a hand. Glow and silhouette sizes follow it, so they
 * scale with how large the person is in the frame. */
export function figureScale(frame: Frame, set: FigureSet, f: number) {
  const pose = set.kinds[f] === POSE,
    a = pose ? 11 : 0,
    b = pose ? 12 : 9;
  const d = Math.hypot(
    fx(frame, set, f, a) - fx(frame, set, f, b),
    fy(frame, set, f, a) - fy(frame, set, f, b),
  );
  return Math.max(d, frame.rect.h * 0.03);
}

/** Batch every visible bone as a glowing line. `width` is the glow radius as
 * a fraction of the figure's measure. */
export function drawBones(
  lines: LineBatch,
  frame: Frame,
  set: FigureSet,
  width: number,
  color: Rgb,
  strength: number,
) {
  for (let f = 0; f < set.count; f++) {
    const bones = set.kinds[f] === POSE ? POSE_BONES : HAND_BONES,
      w = Math.max(3, figureScale(frame, set, f) * width);
    for (let e = 0; e < bones.length; e += 2) {
      const a = bones[e],
        b = bones[e + 1];
      if (!seen(set, f, a) || !seen(set, f, b)) continue;
      lines.segment(
        fx(frame, set, f, a),
        fy(frame, set, f, a),
        fx(frame, set, f, b),
        fy(frame, set, f, b),
        w,
        color[0],
        color[1],
        color[2],
        strength,
      );
    }
  }
}

/** Batch a filled body or hand shape built from capsules around the bones.
 * Flush it with `solid` set. It is an estimate of the outline from measured
 * joints, used only where no segmentation mask exists. */
export function drawSilhouette(
  lines: LineBatch,
  frame: Frame,
  set: FigureSet,
  color: Rgb,
  strength: number,
) {
  for (let f = 0; f < set.count; f++) {
    const pose = set.kinds[f] === POSE,
      shape = pose ? POSE_SHAPE : HAND_SHAPE,
      unit = figureScale(frame, set, f) / 100;
    for (let e = 0; e < shape.length; e += 3) {
      const a = shape[e],
        b = shape[e + 1];
      if (!seen(set, f, a) || !seen(set, f, b)) continue;
      lines.segment(
        fx(frame, set, f, a),
        fy(frame, set, f, a),
        fx(frame, set, f, b),
        fy(frame, set, f, b),
        shape[e + 2] * unit * 1.25,
        color[0],
        color[1],
        color[2],
        strength,
      );
    }
    // The head: centred on the nose, sized from the shoulders.
    if (pose && seen(set, f, 0))
      lines.dot(
        fx(frame, set, f, 0),
        fy(frame, set, f, 0),
        unit * 52,
        color[0],
        color[1],
        color[2],
        strength,
      );
  }
}
