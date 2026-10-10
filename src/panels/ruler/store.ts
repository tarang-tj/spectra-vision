/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Editing the Ruler's points: placing, dragging, finding, undoing. The state
// itself lives in state.ts and is re-exported here.
import type { Pt } from "./homography";
import {
  getState,
  isExtensionTool,
  MIN_POINTS,
  pointsCleared,
  set,
  type Handle,
  type Shape,
  type ShapeKind,
  type Tool,
} from "./state";

export * from "./state";

/** Keep the point on the picture and stamp it with the tap uncertainty (one
 * sd in source pixels) it was placed with, so a later resize cannot change
 * the error bar of a point that has not moved. */
const clamp = (p: Pt, sigma?: number): Pt => {
  const s = getState().source,
    at = s
      ? {
          x: Math.min(s.w, Math.max(0, p.x)),
          y: Math.min(s.h, Math.max(0, p.y)),
        }
      : { x: p.x, y: p.y };
  const sd = sigma ?? p.s;
  return sd === undefined ? at : { ...at, s: sd };
};

const isShapeTool = (t: Tool): t is ShapeKind =>
  t === "path" || t === "area" || t === "edge";

/** Add a vertex to the open shape of this kind, or start one. */
function addVertex(kind: ShapeKind, at: Pt): Handle {
  const { shapes } = getState(),
    last = shapes[shapes.length - 1];
  if (last && last.kind === kind && !last.done) {
    const next = shapes.slice();
    next[next.length - 1] = { ...last, pts: [...last.pts, at] };
    set({ shapes: next });
    return { kind: "vertex", s: next.length - 1, i: last.pts.length };
  }
  set({ shapes: [...shapes, { kind, pts: [at], done: false }] });
  return { kind: "vertex", s: shapes.length, i: 0 };
}

/** Add the next point. Edge taps (lens correction) go anywhere. Otherwise the
 * first four taps are the reference corners, then the chosen tool places a
 * span end or a path or outline vertex. Returns the handle so a drag can
 * continue. */
export function place(p: Pt, sigma?: number): Handle {
  const at = clamp(p, sigma),
    state = getState();
  if (state.tool === "edge") return addVertex("edge", at);
  if (state.corners.length < 4) {
    set({ corners: [...state.corners, at] });
    return { kind: "corner", i: state.corners.length };
  }
  if (isShapeTool(state.tool)) return addVertex(state.tool, at);
  const last = state.measures[state.measures.length - 1];
  if (last && last.b === null) {
    const measures = state.measures.slice();
    measures[measures.length - 1] = { a: last.a, b: at };
    set({ measures });
    return { kind: "end", m: measures.length - 1, end: "b" };
  }
  set({ measures: [...state.measures, { a: at, b: null }] });
  return { kind: "end", m: state.measures.length, end: "a" };
}

export function move(handle: Handle, p: Pt, sigma?: number) {
  const at = clamp(p, sigma),
    state = getState();
  if (handle.kind === "corner") {
    if (!state.corners[handle.i]) return;
    const corners = state.corners.slice();
    corners[handle.i] = at;
    set({ corners });
    return;
  }
  if (handle.kind === "vertex") {
    const shape = state.shapes[handle.s];
    if (!shape || !shape.pts[handle.i]) return;
    const shapes = state.shapes.slice(),
      pts = shape.pts.slice();
    pts[handle.i] = at;
    shapes[handle.s] = { ...shape, pts };
    set({ shapes });
    return;
  }
  const m = state.measures[handle.m];
  if (!m) return;
  const measures = state.measures.slice();
  measures[handle.m] = { ...m, [handle.end]: at };
  set({ measures });
}

/** Distance in canvas CSS pixels is the caller's business; this finds the
 * nearest handle within `radiusSrc` source pixels. */
export function hit(p: Pt, radiusSrc: number): Handle | null {
  const state = getState();
  let best: Handle | null = null,
    bestD = radiusSrc;
  const test = (q: Pt | null, h: Handle) => {
    if (!q) return;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = h;
    }
  };
  state.corners.forEach((c, i) => test(c, { kind: "corner", i }));
  state.measures.forEach((m, i) => {
    test(m.a, { kind: "end", m: i, end: "a" });
    test(m.b, { kind: "end", m: i, end: "b" });
  });
  state.shapes.forEach((sh, s) =>
    sh.pts.forEach((q, i) => test(q, { kind: "vertex", s, i })),
  );
  return best;
}

/** Remove the most recently placed point of the chosen tool; an outline that
 * was closed is reopened. With nothing left of that tool, a span end, then a
 * reference corner (only while nothing else was measured). */
export function undo() {
  const state = getState();
  // An extension tool undoes its own points (see extensions.ts).
  if (isExtensionTool(state.tool)) return;
  if (isShapeTool(state.tool)) {
    const at = state.shapes.map((s) => s.kind).lastIndexOf(state.tool);
    if (at >= 0) {
      const sh = state.shapes[at],
        pts = sh.pts.slice(0, -1),
        shapes = state.shapes.slice();
      if (pts.length) shapes[at] = { ...sh, pts, done: false };
      else shapes.splice(at, 1);
      set({ shapes });
      return;
    }
    if (state.tool === "edge") return;
  }
  const last = state.measures[state.measures.length - 1];
  if (last) {
    set({
      measures:
        last.b === null
          ? state.measures.slice(0, -1)
          : [...state.measures.slice(0, -1), { a: last.a, b: null }],
    });
  } else if (
    state.corners.length &&
    !state.shapes.some((s) => s.kind !== "edge")
  ) {
    set({ corners: state.corners.slice(0, -1) });
  }
}

export const clear = () => {
  set({ corners: [], measures: [], shapes: [], swap: false, lock: null });
  pointsCleared();
};

/** Drop a half-built shape too short to keep; close one long enough. */
const settle = (shapes: Shape[]): Shape[] =>
  shapes
    .map((s) =>
      !s.done && s.pts.length >= MIN_POINTS[s.kind] ? { ...s, done: true } : s,
    )
    .filter((s) => s.done);

/** Choose what taps add. A shape being built is finished if it has enough
 * points and dropped if it does not, so none is left dangling. */
export function setTool(tool: Tool) {
  const state = getState();
  set({ tool, shapes: settle(state.shapes) });
}

/** Close the outline or end the path being built, if it has enough points. */
export function finishShape() {
  const state = getState(),
    last = state.shapes[state.shapes.length - 1];
  if (!last || last.done || last.pts.length < MIN_POINTS[last.kind]) return;
  const shapes = state.shapes.slice();
  shapes[shapes.length - 1] = { ...last, done: true };
  set({ shapes });
}
