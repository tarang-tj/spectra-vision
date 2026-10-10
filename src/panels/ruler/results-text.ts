/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Derived } from "./derive";
import type { RulerState } from "./state";

/** Plain-text results for the clipboard. Nothing is uploaded. */
export function resultsText(s: RulerState, d: Derived): string {
  if (!d.reference || (!d.rows.length && !d.shapes.length)) return "";
  const ref = d.reference,
    lines: string[] = [];
  lines.push(`Reference: ${ref.label}, ${ref.long} x ${ref.short} mm`);
  d.rows.forEach((r) => lines.push(`Measurement ${r.index + 1}: ${r.text}`));
  d.shapes.forEach((r) => {
    if (r.areaText) lines.push(`${r.label} area: ${r.areaText}`);
    if (r.areaAltText) lines.push(`${r.label} area: ${r.areaAltText}`);
    lines.push(
      `${r.label} ${r.kind === "area" ? "perimeter" : "length"}: ${r.lengthText}`,
    );
    r.legTexts.forEach((t, i) => lines.push(`${r.label} leg ${i + 1}: ${t}`));
  });
  d.tape.checks.forEach((c) =>
    lines.push(
      `Tape test, measurement ${c.index + 1}: ${[c.reading, c.tape && `tape ${c.tape}`, c.difference && `difference ${c.difference}`, c.verdict].filter(Boolean).join(", ")}`,
    ),
  );
  if (d.tape.tally) lines.push(`Tape test: ${d.tape.tally}.`);
  if (d.known?.summary) lines.push(d.known.summary);
  lines.push(`Error bar: 2 standard deviations. ${d.basis}`);
  if (s.swap) lines.push("Reference sides were swapped by hand.");
  return lines.join("\n");
}
