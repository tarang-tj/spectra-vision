/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which handle a press takes hold of, and when a press places a point instead.
// Reads the Ruler's state; changes nothing.
import type { Pt } from "./homography";
import { getState, type Handle, type RulerState } from "./state";
import { pendingRef, refCorners } from "./known/store-known";
import { grabRadius } from "./tap";

/** True while something is part built: the first reference, a further
 * reference, an outline, path or edge, or a span with one end. Every press
 * then places the next point of it and none grabs a handle, so a small sheet
 * can be tapped corner by corner and a point can go right beside another. */
export function building(s: RulerState): boolean {
  const last = s.shapes[s.shapes.length - 1],
    open = !!last && !last.done;
  if (s.tool === "edge") return open && last.kind === "edge";
  if (s.corners.length < 4 || pendingRef(s) >= 0) return true;
  if (s.tool === "path" || s.tool === "area")
    return open && last.kind === s.tool;
  const span = s.measures[s.measures.length - 1];
  return s.tool === "span" && !!span && span.b === null;
}

/** Every handle on the picture with where it is, in source pixels. */
export function handles(s: RulerState): { at: Pt; handle: Handle }[] {
  const out: { at: Pt; handle: Handle }[] = [];
  s.corners.forEach((at, i) => out.push({ at, handle: { kind: "corner", i } }));
  refCorners(s).forEach(({ p, r, i }) =>
    out.push({ at: p, handle: { kind: "ref", r, i } }),
  );
  s.measures.forEach((m, i) => {
    out.push({ at: m.a, handle: { kind: "end", m: i, end: "a" } });
    if (m.b) out.push({ at: m.b, handle: { kind: "end", m: i, end: "b" } });
  });
  s.shapes.forEach((sh, n) =>
    sh.pts.forEach((at, i) =>
      out.push({ at, handle: { kind: "vertex", s: n, i } }),
    ),
  );
  return out;
}

/** The nearest handle that the press at `p` is within reach of, or null. A
 * handle's reach is `radiusSrc` source pixels, less where another handle is
 * close (see `grabRadius`), and never under `floorSrc`. Distances in canvas
 * CSS pixels are the caller's business. */
export function hit(
  p: Pt,
  radiusSrc: number,
  floorSrc = radiusSrc / 3,
): Handle | null {
  const all = handles(getState());
  let best: Handle | null = null,
    bestD = Infinity;
  all.forEach(({ at, handle }, k) => {
    const d = Math.hypot(at.x - p.x, at.y - p.y);
    if (d > radiusSrc || d > bestD) return;
    let spacing = Infinity;
    all.forEach((other, j) => {
      if (j !== k)
        spacing = Math.min(
          spacing,
          Math.hypot(other.at.x - at.x, other.at.y - at.y),
        );
    });
    if (d > grabRadius(radiusSrc, floorSrc, spacing)) return;
    bestD = d;
    best = handle;
  });
  return best;
}

/** What a handle is called in the step line. */
export function handleName(h: Handle, s: RulerState): string {
  if (h.kind === "corner") return `corner ${h.i + 1} of the reference`;
  if (h.kind === "ref") return `corner ${h.i + 1} of reference ${h.r + 2}`;
  if (h.kind === "end") return `an end of span ${h.m + 1}`;
  const kind = s.shapes[h.s]?.kind;
  return `point ${h.i + 1} of ${kind === "area" ? "an outline" : kind === "edge" ? "a straight edge" : "a path"}`;
}
