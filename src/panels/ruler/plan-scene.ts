/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the top-down drawing contains, in plane millimetres with ready-made
// label text. The canvas and the SVG export both draw from this one scene.
import type { Derived } from "./derive";
import { toPlane } from "./shapes";
import type { Pt } from "./homography";
import type { RulerState } from "./state";

export type PlanItem =
  | { kind: "reference"; pts: Pt[]; label: string }
  | { kind: "span"; pts: Pt[]; label: string }
  | {
      kind: "path" | "area";
      name: string;
      pts: Pt[];
      /** One label per leg; an area includes its closing leg. */
      legs: string[];
      /** Path total or outline perimeter. */
      length: string;
      area: string | null;
      /** Why there is no area, when there is none. */
      note: string | null;
    };
export type PlanScene = {
  items: PlanItem[];
  bounds: { x0: number; y0: number; x1: number; y1: number };
  basis: string;
  unit: string;
};

/** Null until the reference is solved. Not-measurable items are left out. */
export function buildScene(s: RulerState, d: Derived): PlanScene | null {
  const sheet = d.sheet;
  if (!sheet || !d.reference) return null;
  const items: PlanItem[] = [
    {
      kind: "reference",
      pts: sheet.plane,
      label: d.reference.label,
    },
  ];
  d.rows.forEach((r) => {
    const m = s.measures[r.index];
    if (!r.span || !m || !m.b) return;
    const pts = toPlane(sheet.h, [m.a, m.b], d.lens);
    if (pts) items.push({ kind: "span", pts, label: r.text });
  });
  d.shapes.forEach((r) => {
    if (!r.result) return;
    items.push({
      kind: r.kind,
      name: r.label,
      pts: r.result.plane,
      legs: r.legTexts,
      length: r.lengthText,
      area: r.areaText,
      note: r.result.selfIntersecting ? "crosses itself, no area" : null,
    });
  });
  const all = items.flatMap((i) => i.pts);
  return {
    items,
    bounds: {
      x0: Math.min(...all.map((p) => p.x)),
      y0: Math.min(...all.map((p) => p.y)),
      x1: Math.max(...all.map((p) => p.x)),
      y1: Math.max(...all.map((p) => p.y)),
    },
    basis: d.basis,
    unit: s.unit,
  };
}
