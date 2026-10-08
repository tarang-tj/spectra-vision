/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { LAVENDER, MINT, WHITE } from "../../gl/color";
import type { Rgb } from "../../gl/color";
import type { LineBatch } from "../../gl/lines";
import type { Frame } from "../../vision/frame";
import type { Point } from "../../vision/types";
import { px, py, span, visible } from "./inputs";

/** Batch one path through the face mesh as a glowing ribbon. */
export function contour(
  lines: LineBatch,
  frame: Frame,
  face: Point[],
  path: number[],
  width: number,
  color: Rgb,
  strength: number,
) {
  lines.ribbon();
  for (let i = 0; i < path.length; i++) {
    const p = face[path[i]];
    if (p)
      lines.point(
        px(frame, p),
        py(frame, p),
        width,
        color[0],
        color[1],
        color[2],
        strength,
      );
  }
}
/** Batch the glow of one iris: `ring` is its centre and two opposite rim
 * points, `open` how open the eye is (0 puts it out), `wide` enlarges it. */
export function iris(
  lines: LineBatch,
  frame: Frame,
  face: Point[],
  ring: number[],
  open: number,
  wide: number,
) {
  const c = face[ring[0]],
    a = face[ring[1]],
    b = face[ring[2]];
  if (!c || !a || !b || open <= 0.02) return;
  const radius = Math.max(2, span(frame, a, b) / 2) * (1 + 0.5 * wide),
    x = px(frame, c),
    y = py(frame, c);
  lines.dot(x, y, radius * 4.5, MINT[0], MINT[1], MINT[2], 0.55 * open);
  lines.dot(x, y, radius * 1.6, WHITE[0], WHITE[1], WHITE[2], open);
}

/** The face as the pose model sees it, for modes with no face mesh: a glow
 * on each eye (landmarks 2 and 5) and a line across the mouth (9 to 10), at
 * a fixed strength. Returns false when the eyes are not visible. */
export function poseFace(
  lines: LineBatch,
  frame: Frame,
  pose: Point[] | undefined,
): boolean {
  if (!pose || !visible(pose[2]) || !visible(pose[5])) return false;
  const size = span(frame, pose[2], pose[5]);
  for (let i = 2; i <= 5; i += 3) {
    const x = px(frame, pose[i]),
      y = py(frame, pose[i]);
    lines.dot(x, y, size * 0.55, MINT[0], MINT[1], MINT[2], 0.55);
    lines.dot(x, y, size * 0.2, WHITE[0], WHITE[1], WHITE[2], 1);
  }
  if (visible(pose[9]) && visible(pose[10]))
    lines.segment(
      px(frame, pose[9]),
      py(frame, pose[9]),
      px(frame, pose[10]),
      py(frame, pose[10]),
      size * 0.22,
      LAVENDER[0],
      LAVENDER[1],
      LAVENDER[2],
      0.7,
    );
  return true;
}
