/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { EXTENSIONS } from "./extensions";
import {
  finishShape,
  MIN_POINTS,
  setTool,
  type RulerState,
  type Tool,
} from "./store";

const TOOLS: { id: Exclude<Tool, "edge">; label: string; hint: string }[] = [
  { id: "span", label: "Span", hint: "Distance between two points" },
  {
    id: "path",
    label: "Path",
    hint: "Total length through three or more points",
  },
  { id: "area", label: "Area", hint: "Area and perimeter of a closed outline" },
];
const FINISH: Record<string, string> = {
  path: "Finish path",
  area: "Close outline",
  edge: "Finish edge",
};

/** The shape being built, if it belongs to the chosen tool. */
export function openShape(s: RulerState) {
  const last = s.shapes[s.shapes.length - 1];
  return last && !last.done && last.kind === s.tool ? last : null;
}

/** Choose what a tap adds, and finish or close the path or outline. */
export default function ShapeTools({
  s,
  ready,
}: {
  s: RulerState;
  /** The reference is solved: tools that need it can be chosen. */
  ready: boolean;
}) {
  const open = openShape(s),
    canFinish = !!open && open.pts.length >= MIN_POINTS[open.kind];
  return (
    <section className="ruler-block" aria-label="Shape">
      <h3>What to measure</h3>
      <div className="ruler-group" role="group" aria-label="Shape">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className="button"
            aria-pressed={s.tool === t.id}
            title={t.hint}
            onClick={() => setTool(t.id)}
          >
            {t.label}
          </button>
        ))}
        {EXTENSIONS.map((t) => (
          <button
            key={t.tool}
            className="button"
            aria-pressed={s.tool === t.tool}
            title={ready ? t.hint : "Tap the four reference corners first."}
            disabled={!ready && s.tool !== t.tool}
            onClick={() => setTool(s.tool === t.tool ? "span" : t.tool)}
          >
            {t.label}
          </button>
        ))}
        {(s.tool === "path" || s.tool === "area" || s.tool === "edge") && (
          <button
            className="button"
            onClick={finishShape}
            disabled={!canFinish}
          >
            {FINISH[s.tool]}
          </button>
        )}
      </div>
      <p className="ruler-note">
        Span: two points. Path: three or more points, giving the total length
        and each leg. Area: three or more corners of an outline, closed with the
        Close outline button, giving its area and perimeter.
      </p>
    </section>
  );
}
