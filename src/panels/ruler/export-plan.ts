/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// "Save plan": an SVG of the top-down drawing and a CSV of every measurement.
// Both are built here as text; the panel hands them to the browser as local
// downloads. Nothing is uploaded.
import type { Derived } from "./derive";
import { LEGEND, type Prim } from "./plan-layout";
import type { PlanScene } from "./plan-scene";
import type { RulerState } from "./state";
import { droppedNote } from "./monte-carlo";
import { toPlane } from "./shapes";
import type { Fit } from "./topdown";
import { areaFromMm2, areaUnit, fromMm } from "./units";

const esc = (t: string) =>
  t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Break `text` into lines of about `max` characters at spaces. */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    if (line && line.length + word.length + 1 > max) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines;
}

/** The SVG text. `photo` is a PNG data URL of the rectified floor, or null
 * for the drawing alone (the default: no photo leaves the page). */
export function planSvg(
  scene: PlanScene,
  fit: Fit,
  prims: Prim[],
  photo: string | null,
): string {
  const footer = [
      `Error bars are 2 standard deviations. ${scene.basis}`,
      LEGEND,
    ].flatMap((t) => wrap(t, Math.max(40, Math.floor(fit.width / 6.2)))),
    total = fit.height + 12 + footer.length * 15,
    out: string[] = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${fit.width}" height="${total}" viewBox="0 0 ${fit.width} ${total}" role="img" aria-label="Top-down plan of the measured surface">`,
      `<rect width="${fit.width}" height="${total}" fill="#0b1214"/>`,
    ];
  if (photo)
    out.push(
      `<image href="${photo}" x="0" y="0" width="${fit.width}" height="${fit.height}"/>`,
    );
  for (const p of prims) {
    if (p.t === "line") {
      const pts = p.pts
        .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
        .join(" ");
      out.push(
        `<${p.closed ? "polygon" : "polyline"} points="${pts}" fill="none" stroke="${p.color}" stroke-width="${p.width}"/>`,
      );
    } else if (p.t === "dot") {
      out.push(
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${p.color}"/>`,
      );
    } else {
      const anchor = p.anchor ?? "start";
      out.push(
        `<text x="${p.x.toFixed(1)}" y="${p.y.toFixed(1)}" font-family="system-ui, sans-serif" font-weight="600" font-size="${p.size}" text-anchor="${anchor}" fill="${p.color}" stroke="#0b1214" stroke-width="3" paint-order="stroke">${esc(p.text)}</text>`,
      );
    }
  }
  footer.forEach((line, i) =>
    out.push(
      `<text x="8" y="${fit.height + 18 + i * 15}" font-family="system-ui, sans-serif" font-size="11" fill="#a7b4b8">${esc(line)}</text>`,
    ),
  );
  out.push("</svg>");
  return out.join("\n");
}

const field = (v: string | number) => {
  const t = String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const num = (v: number) => String(Number(v.toPrecision(8)));
const verts = (pts: { x: number; y: number }[]) =>
  pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join("; ");

export const CSV_HEADER =
  "shape,measure,value,error_2sd,unit,vertices_plane_mm,basis,note";

/** One row per measurement: value, its error (2 sd), the unit, and the
 * vertices in plane millimetres. */
export function planCsv(s: RulerState, d: Derived): string {
  const u = s.unit,
    rows: (string | number)[][] = [],
    add = (
      shape: string,
      measure: string,
      value: number,
      error: number,
      unit: string,
      pts: { x: number; y: number }[],
      note = "",
    ) =>
      rows.push([
        shape,
        measure,
        num(value),
        num(error),
        unit,
        verts(pts),
        d.basis,
        note,
      ]),
    // A shape that could not be measured still gets a row, with no value.
    blank = (shape: string, measure: string, unit: string, why: string) =>
      rows.push([shape, measure, "", "", unit, "", d.basis, why]);
  if (d.sheet) {
    d.rows.forEach((r) => {
      const m = s.measures[r.index],
        pts = m?.b ? toPlane(d.sheet!.h, [m.a, m.b], d.lens) : null;
      if (r.span && pts)
        add(
          `span ${r.index + 1}`,
          "length",
          fromMm(r.span.mm, u),
          fromMm(r.span.errorMm, u),
          u,
          pts,
          r.span.kept < 1 ? droppedNote(r.span.kept) : "",
        );
      else if (m?.b)
        blank(
          `span ${r.index + 1}`,
          "length",
          u,
          r.warnings[0] ?? "not measured",
        );
    });
    d.shapes.forEach((r) => {
      const res = r.result;
      if (!res) {
        blank(
          r.label,
          r.kind === "area" ? "area" : "length",
          r.kind === "area" ? areaUnit(u) : u,
          r.warnings[0] ?? "not measured",
        );
        return;
      }
      const note = res.kept < 1 ? droppedNote(res.kept) : "";
      res.legs.forEach((l, i) =>
        add(
          r.label,
          `leg ${i + 1}`,
          fromMm(l.value, u),
          fromMm(l.error, u),
          u,
          [res.plane[i], res.plane[(i + 1) % res.plane.length]],
          note,
        ),
      );
      add(
        r.label,
        r.kind === "area" ? "perimeter" : "length",
        fromMm(res.length.value, u),
        fromMm(res.length.error, u),
        u,
        res.plane,
        note,
      );
      if (res.selfIntersecting)
        blank(
          r.label,
          "area",
          areaUnit(u),
          "The outline crosses itself, so it has no single area.",
        );
      if (res.area)
        add(
          r.label,
          "area",
          areaFromMm2(res.area.value, u),
          areaFromMm2(res.area.error, u),
          areaUnit(u),
          res.plane,
          note,
        );
    });
  }
  return (
    [CSV_HEADER, ...rows.map((r) => r.map(field).join(","))].join("\n") + "\n"
  );
}

/** Hand text to the browser as a local file download. */
export function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
