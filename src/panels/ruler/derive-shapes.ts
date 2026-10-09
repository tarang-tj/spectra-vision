/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Results for finished paths and outlines, as numbers and as text.
import { formatMeasured } from "../../measure/format";
import { measured } from "../../measure/noise";
import type { Sheet } from "./homography";
import type { Lens } from "./lens";
import { measureShape, type Quantity, type ShapeResult } from "./shapes";
import type { Shape } from "./state";
import { areaFromMm2, areaUnit, bigAreaUnit, fromMm, type Unit } from "./units";

export type ShapeRow = {
  /** Index into the state's shapes. */
  shape: number;
  kind: "path" | "area";
  label: string;
  result: ShapeResult | null;
  legTexts: string[];
  /** Path length or outline perimeter. */
  lengthText: string;
  areaText: string | null;
  /** The area again in square metres or feet, when that is a better fit. */
  areaAltText: string | null;
  warnings: string[];
};

const len = (q: Quantity, unit: Unit, basis: string) =>
  formatMeasured(
    measured(fromMm(q.value, unit), fromMm(q.error, unit), unit, basis),
  );
const area = (q: Quantity, unit: Unit, basis: string) =>
  formatMeasured(
    measured(
      areaFromMm2(q.value, unit),
      areaFromMm2(q.error, unit),
      areaUnit(unit),
      basis,
    ),
  );

/** Finished paths and outlines only: a shape still being tapped has no result. */
export function shapeRows(
  shapes: readonly Shape[],
  sheet: Sheet | null,
  longSide: number,
  sigma: number,
  unit: Unit,
  lens: Lens | null,
  basis: string,
  far: number,
): ShapeRow[] {
  const rows: ShapeRow[] = [],
    counts = { path: 0, area: 0 };
  shapes.forEach((sh, shape) => {
    if (sh.kind === "edge" || !sh.done) return;
    const kind = sh.kind,
      label = `${kind === "path" ? "Path" : "Area"} ${++counts[kind]}`,
      result = sheet
        ? measureShape(sheet, sh.pts, kind === "area", sigma, lens)
        : null,
      warnings: string[] = [];
    if (!result)
      warnings.push(
        "Not measured: a point is at or beyond the horizon of the surface, or the reference is too small for a shape this far away. Tap points on the reference's surface, or use a bigger reference.",
      );
    else {
      if (result.selfIntersecting)
        warnings.push(
          "This outline crosses itself, so it has no single area. Drag a corner until the sides no longer cross. The perimeter is still given.",
        );
      if (Math.max(...result.legs.map((l) => l.value)) > far * longSide)
        warnings.push(
          "A leg is more than 10 times the reference's long side. Small errors in the reference grow with distance, so trust it less than the bar suggests.",
        );
    }
    const alt = bigAreaUnit(unit);
    rows.push({
      shape,
      kind,
      label,
      result,
      legTexts: result ? result.legs.map((l) => len(l, unit, basis)) : [],
      lengthText: result ? len(result.length, unit, basis) : "not measured",
      areaText: result?.area ? area(result.area, unit, basis) : null,
      areaAltText:
        result?.area && alt !== unit ? area(result.area, alt, basis) : null,
      warnings,
    });
  });
  return rows;
}
