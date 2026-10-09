/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeAll } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import {
  CSV_HEADER,
  planCsv,
  planSvg,
  wrap,
} from "../src/panels/ruler/export-plan";
import {
  applyHomography,
  type Mat3,
  type Pt,
} from "../src/panels/ruler/homography";
import { layoutScene, niceLength } from "../src/panels/ruler/plan-layout";
import { buildScene } from "../src/panels/ruler/plan-scene";
import {
  bindSource,
  finishShape,
  getState,
  place,
  resetRuler,
  setTool,
  setUnit,
} from "../src/panels/ruler/store";
import { fitBox } from "../src/panels/ruler/topdown";

// A mild perspective, as in a photo taken standing over the floor.
const MAP: Mat3 = [1.5, 0.12, 80, 0.05, 1.4, 60, 0.00012, 0.00025, 1];
const img = (p: Pt) => applyHomography(MAP, p)!;

/** Independent area and perimeter for the truth (not the code under test). */
const shoelace = (pts: Pt[]) =>
  Math.abs(
    pts.reduce(
      (t, a, i) =>
        t +
        (a.x * pts[(i + 1) % pts.length].y - pts[(i + 1) % pts.length].x * a.y),
      0,
    ),
  ) / 2;
const around = (pts: Pt[]) =>
  pts.reduce(
    (t, a, i) =>
      t +
      Math.hypot(
        a.x - pts[(i + 1) % pts.length].x,
        a.y - pts[(i + 1) % pts.length].y,
      ),
    0,
  );

const room: Pt[] = [
  { x: 400, y: 300 },
  { x: 3000, y: 320 },
  { x: 3100, y: 2600 },
  { x: 450, y: 2500 },
];

beforeAll(() => {
  resetRuler();
  bindSource(1, 4000, 3000, 1);
  setUnit("m");
  [
    { x: 60, y: 60 },
    { x: 339.4, y: 60 },
    { x: 339.4, y: 275.9 },
    { x: 60, y: 275.9 },
  ].forEach((p) => place(img(p)));
  place(img({ x: 500, y: 400 }));
  place(img({ x: 1500, y: 400 }));
  setTool("area");
  room.forEach((p) => place(img(p)));
  finishShape();
  setTool("path");
  room.slice(0, 3).forEach((p) => place(img(p)));
  finishShape();
});

describe("plan export for a known scene", () => {
  it("writes the CSV with value, error, unit and plane vertices", () => {
    const d = derive(getState()),
      lines = planCsv(getState(), d).trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER);
    const rows = lines
      .slice(1)
      .map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
    const find = (shape: string, measure: string) =>
      rows.find((r) => r[0] === shape && r[1] === measure)!;
    // 1 span + (4 legs + perimeter + area) + (2 legs + length)
    expect(rows).toHaveLength(1 + 6 + 3);
    const area = find("Area 1", "area"),
      truthM2 = shoelace(room) / 1e6;
    expect(area[4]).toBe("m²");
    expect(Math.abs(Number(area[2]) - truthM2) / truthM2).toBeLessThan(1e-6);
    expect(Number(area[3])).toBeGreaterThan(0);
    const perimeter = find("Area 1", "perimeter"),
      truthP = around(room) / 1000;
    expect(Math.abs(Number(perimeter[2]) - truthP) / truthP).toBeLessThan(1e-6);
    // The vertices are plane millimetres, four of them for the outline.
    const verts = area[5].replace(/"/g, "").split("; ");
    expect(verts).toHaveLength(4);
    // The plane frame starts at the sheet's first corner, (60, 60) here.
    expect(verts[0].split(" ").map(Number)[0]).toBeCloseTo(340, 1);
    expect(verts[0].split(" ").map(Number)[1]).toBeCloseTo(240, 1);
    expect(find("span 1", "length")[2]).toBe("1");
    expect(area[6]).toMatch(/Tap placement only/);
  });
  it("writes an SVG with shapes, value ± error labels, a scale bar and the basis", () => {
    const s = getState(),
      d = derive(s),
      scene = buildScene(s, d)!,
      fit = fitBox(scene.bounds),
      prims = layoutScene(scene, fit),
      svg = planSvg(scene, fit, prims, null);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<polygon");
    expect(svg).toContain("<polyline");
    expect(svg).toMatch(/Area 1/);
    expect(svg).toMatch(/area [\d.]+ ± [\d.]+ m²/);
    expect(svg).toMatch(/>(0\.5|1|2) m</); // the scale bar label
    // The footer wraps, so compare the text with line breaks removed.
    const flat = [...svg.matchAll(/>([^<]*)<\/text>/g)]
      .map((m) => m[1])
      .join(" ");
    expect(flat).toContain(
      "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.",
    );
    expect(flat).toContain("Dark areas are beyond the horizon");
    expect(svg).not.toContain("<image");
    expect(planSvg(scene, fit, prims, "data:image/png;base64,AAAA")).toContain(
      '<image href="data:image/png;base64,AAAA"',
    );
  });
  it("escapes text and wraps footers", () => {
    const d = derive(getState()),
      scene = buildScene(getState(), d)!,
      fit = fitBox(scene.bounds),
      svg = planSvg({ ...scene, basis: "a < b & c" }, fit, [], null);
    expect(svg).toContain("a &lt; b &amp; c");
    expect(wrap("one two three four", 9)).toEqual(["one two", "three", "four"]);
  });
  it("picks a round scale bar length", () => {
    expect(niceLength(1234, "mm").text).toMatch(/^(1|2|5)0* mm$/);
    expect(niceLength(1900, "m").mm).toBe(2000);
  });
  it("names the error column and gives an unmeasured shape a row with a reason", () => {
    const real = derive(getState()),
      d = {
        ...real,
        rows: [],
        shapes: [
          {
            shape: 0,
            kind: "area" as const,
            label: "Area 9",
            result: null,
            legTexts: [],
            lengthText: "not measured",
            areaText: null,
            areaAltText: null,
            warnings: ["Not measured: a point is beyond the horizon."],
          },
        ],
      },
      csv = planCsv(getState(), d).trim().split("\n");
    expect(csv[0]).toBe(
      "shape,measure,value,error_2sd,unit,vertices_plane_mm,basis,note",
    );
    const cols = csv[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    expect(cols[0]).toBe("Area 9");
    expect(cols[2]).toBe(""); // no value
    expect(cols[3]).toBe("");
    expect(cols[7]).toMatch(/Not measured/);
  });
});
