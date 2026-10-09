/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { ShapeRow } from "./derive-shapes";

/** Numbers behind an output, so tests and exports can read them. */
const attrs = (
  q: { value: number; error: number } | undefined | null,
  area = false,
) =>
  q
    ? area
      ? { "data-mm2": q.value, "data-error-mm2": q.error }
      : { "data-mm": q.value, "data-error-mm": q.error }
    : {};

/** Paths and outlines: total, legs, area. Each value reads value ± error. */
export default function ShapeResults({ rows }: { rows: ShapeRow[] }) {
  return (
    <>
      {rows.map((r) => (
        <li key={r.shape} data-testid="ruler-shape">
          <span className="ruler-label">{r.label}</span>
          {r.areaText && (
            <>
              <span className="ruler-label">Area</span>
              <output
                className="ruler-value"
                data-testid="ruler-area"
                {...attrs(r.result?.area, true)}
              >
                {r.areaText}
              </output>
              {r.areaAltText && (
                <output className="ruler-sub" data-testid="ruler-area-alt">
                  {r.areaAltText}
                </output>
              )}
            </>
          )}
          <span className="ruler-label">
            {r.kind === "area" ? "Perimeter" : "Total length"}
          </span>
          <output
            className={r.areaText ? "ruler-sub" : "ruler-value"}
            data-testid="ruler-length"
            {...attrs(r.result?.length)}
          >
            {r.lengthText}
          </output>
          {r.legTexts.length > 0 && (
            <ol className="ruler-legs" aria-label={`${r.label} legs`}>
              {r.legTexts.map((t, i) => (
                <li key={i}>
                  Leg {i + 1}:{" "}
                  <output {...attrs(r.result?.legs[i])}>{t}</output>
                </li>
              ))}
            </ol>
          )}
          {r.warnings.map((w) => (
            <p key={w} className="ruler-warn">
              {w}
            </p>
          ))}
        </li>
      ))}
    </>
  );
}
