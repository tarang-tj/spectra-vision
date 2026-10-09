/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useStudio } from "../studio-context";
import { derive } from "./ruler/derive";
import ReferencePicker from "./ruler/reference-picker";
import Results from "./ruler/results";
import { clear, setUnit, toggleSwap, undo, useRuler } from "./ruler/store";
import { UNITS } from "./ruler/units";
import { useRulerStage } from "./ruler/use-stage";
import type { PanelDef } from "./types";
import "./ruler/ruler.css";

/** Measure distances on one flat surface from a picture, using a sheet of known
 * size laid on that surface. Every result carries an error bar and says what
 * the bar leaves out. */
function Ruler() {
  const s = useRuler(),
    d = derive(s),
    { paused, frame } = useStudio(),
    { freeze, resume } = useRulerStage(),
    still = paused || frame.source?.element instanceof HTMLImageElement,
    pending = s.measures.some((m) => m.b === null);

  let step: string;
  if (!d.reference) step = d.problem ?? "";
  else if (!still)
    step =
      "Freeze the picture, or tap it, then tap the four corners of the reference.";
  else if (s.corners.length < 4)
    step = `Tap corner ${s.corners.length + 1} of 4 of the ${d.reference.label}, in any order.`;
  else if (d.problem) step = d.problem;
  else if (pending) step = "Tap the other end of the span.";
  else
    step = "Tap two points to measure between them. Drag any handle to adjust.";

  return (
    <div className="ruler-panel">
      <h2>
        Ruler <span className="ruler-beta">Beta</span>
      </h2>
      <p className="ruler-note">
        Lay a sheet of known size flat on the surface you want to measure, in
        the same plane as the things you measure. Works on one flat surface
        only. The further a span is from the reference, the larger its error. A
        sheet of paper beats a card for rooms.
      </p>
      <ReferencePicker s={s} />
      <p className="ruler-step" role="status" data-testid="ruler-step">
        {step}
      </p>
      {d.referenceWarnings.map((w) => (
        <p key={w} className="ruler-warn">
          {w}
        </p>
      ))}
      <div className="ruler-group" role="group" aria-label="Ruler actions">
        {still && paused ? (
          <button className="button" onClick={resume}>
            Resume live view
          </button>
        ) : (
          !still && (
            <button className="button" onClick={freeze}>
              Freeze frame
            </button>
          )
        )}
        <button className="button" onClick={undo} disabled={!s.corners.length}>
          Undo
        </button>
        <button className="button" onClick={clear} disabled={!s.corners.length}>
          Clear
        </button>
        {d.sheet && (
          <button className="button" onClick={toggleSwap} aria-pressed={s.swap}>
            Swap sides
          </button>
        )}
      </div>
      <section className="ruler-block" aria-label="Units">
        <h3>Units</h3>
        <div className="ruler-group" role="group" aria-label="Units">
          {UNITS.map((u) => (
            <button
              key={u}
              className="button"
              aria-pressed={s.unit === u}
              onClick={() => setUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </section>
      <Results s={s} d={d} />
      <ul className="ruler-guidance">
        <li>
          The long side of the reference is guessed from how it looks. If the
          labels on its edges are swapped, press Swap sides.
        </li>
        <li>
          Measure only points that lie on the same surface as the reference.
          Anything raised above it reads wrong.
        </li>
      </ul>
    </div>
  );
}

const ruler: PanelDef = {
  id: "ruler",
  label: "Ruler",
  order: 40,
  tag: "Beta",
  Component: Ruler,
};
export default ruler;
