/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Turns a scene into drawing primitives in output pixels. Both the canvas
// drawing and the SVG file are written from these, so they cannot disagree.
import { fromMm, toMm, type Unit } from "./units";
import type { Fit } from "./topdown";
import type { PlanScene } from "./plan-scene";

export type Prim =
  | {
      t: "line";
      pts: [number, number][];
      closed: boolean;
      color: string;
      width: number;
      dash?: boolean;
    }
  | { t: "dot"; x: number; y: number; color: string }
  | {
      t: "text";
      x: number;
      y: number;
      text: string;
      color: string;
      size: number;
      anchor?: "start" | "middle" | "end";
    };

export const COLORS = {
  ref: "#ffd18d",
  span: "#a4ffd9",
  path: "#8ec5ff",
  area: "#a4ffd9",
  ink: "#0b1214",
  text: "#e8f1f2",
};
export const LEGEND =
  "Dark areas are beyond the horizon, outside the photo, or too far away to resolve.";

/** A round length near `target` mm: 1, 2 or 5 times a power of ten in `unit`. */
export function niceLength(
  target: number,
  unit: Unit,
): { mm: number; text: string } {
  const inUnit = fromMm(target, unit),
    exp = Math.floor(Math.log10(inUnit)),
    base = 10 ** exp,
    pick = [1, 2, 5, 10].find((m) => m * base >= inUnit * 0.7) ?? 10,
    value = pick * base;
  return {
    mm: toMm(value, unit),
    text: `${Number(value.toPrecision(3))} ${unit}`,
  };
}

const mid = (a: [number, number], b: [number, number]): [number, number] => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

export function layoutScene(scene: PlanScene, fit: Fit): Prim[] {
  const { box, ppm, height } = fit,
    px = (p: { x: number; y: number }): [number, number] => [
      (p.x - box.x0) * ppm,
      (p.y - box.y0) * ppm,
    ],
    out: Prim[] = [];
  for (const item of scene.items) {
    const pts = item.pts.map(px);
    if (item.kind === "reference") {
      out.push({ t: "line", pts, closed: true, color: COLORS.ref, width: 2 });
      out.push({
        t: "text",
        x: pts[0][0] + 4,
        y: pts[0][1] - 5,
        text: item.label,
        color: COLORS.ref,
        size: 11,
      });
    } else if (item.kind === "span") {
      out.push({ t: "line", pts, closed: false, color: COLORS.span, width: 2 });
      pts.forEach(([x, y]) => out.push({ t: "dot", x, y, color: COLORS.span }));
      const [mx, my] = mid(pts[0], pts[1]);
      out.push({
        t: "text",
        x: mx,
        y: my - 6,
        text: item.label,
        color: COLORS.span,
        size: 11,
        anchor: "middle",
      });
    } else {
      const closed = item.kind === "area",
        color = COLORS[item.kind];
      out.push({ t: "line", pts, closed, color, width: 2 });
      pts.forEach(([x, y]) => out.push({ t: "dot", x, y, color }));
      item.legs.forEach((text, i) => {
        const [mx, my] = mid(pts[i], pts[(i + 1) % pts.length]);
        out.push({
          t: "text",
          x: mx,
          y: my - 5,
          text,
          color,
          size: 10,
          anchor: "middle",
        });
      });
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length,
        cy = pts.reduce((s, p) => s + p[1], 0) / pts.length,
        lines = [
          item.name,
          `${closed ? "perimeter" : "length"} ${item.length}`,
          item.area ? `area ${item.area}` : (item.note ?? ""),
        ].filter(Boolean);
      lines.forEach((text, i) =>
        out.push({
          t: "text",
          x: cx,
          y: cy + (i - (lines.length - 1) / 2) * 14,
          text,
          color: COLORS.text,
          size: 11,
          anchor: "middle",
        }),
      );
    }
  }
  // Scale bar, bottom left, about a fifth of the width.
  const bar = niceLength(box.w * 0.2, scene.unit as Unit),
    x0 = 12,
    y0 = height - 14,
    len = bar.mm * ppm;
  out.push({
    t: "line",
    pts: [
      [x0, y0],
      [x0 + len, y0],
    ],
    closed: false,
    color: COLORS.text,
    width: 3,
  });
  out.push({
    t: "line",
    pts: [
      [x0, y0 - 5],
      [x0, y0 + 5],
    ],
    closed: false,
    color: COLORS.text,
    width: 2,
  });
  out.push({
    t: "line",
    pts: [
      [x0 + len, y0 - 5],
      [x0 + len, y0 + 5],
    ],
    closed: false,
    color: COLORS.text,
    width: 2,
  });
  out.push({
    t: "text",
    x: x0,
    y: y0 - 9,
    text: bar.text,
    color: COLORS.text,
    size: 11,
  });
  return out;
}
