/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useStudio } from "../studio-context";
import { derive } from "./ruler/derive";
import KnownSizes from "./ruler/known-sizes";
import { EXTENSIONS, extensionEnv, extensionFor } from "./ruler/extensions";
import LensSection from "./ruler/lens-section";
import PlanPanel from "./ruler/plan-panel";
import ReferencePicker from "./ruler/reference-picker";
import Results from "./ruler/results";
import ShapeTools, { openShape } from "./ruler/shape-tools";
import TapeTest from "./ruler/tape-test";
import {
  clear,
  isEmpty,
  pendingRef,
  setUnit,
  toggleSwap,
  undo,
  useRuler,
} from "./ruler/store";
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
    hasSource = !!frame.source,
    still =
      hasSource &&
      (paused || frame.source?.element instanceof HTMLImageElement),
    { freeze, resume } = useRulerStage(still),
    // Values belong to the picture they were measured on: not to a frame of
    // another photo that has not been drawn over yet.
    show = still && s.generation === frame.source?.generation,
    pending = s.measures.some((m) => m.b === null),
    ext = extensionFor(s.tool),
    // A tool takes taps only once the reference is placed; until then taps
    // and Undo belong to the reference corners.
    toolActive = ext !== null && s.corners.length === 4,
    open = openShape(s),
    adding = pendingRef(s);

  let step: string;
  if (!hasSource) step = "Choose a camera, photo or demo first.";
  else if (!still)
    step =
      s.tool === "edge" || d.reference
        ? "Freeze the picture, then tap on it. A moving picture cannot be measured."
        : (d.problem ?? "");
  else if (s.tool === "edge")
    step =
      "Tap three or more points along an edge that is straight in reality, then press Finish edge. Do at least two edges.";
  else if (!d.reference) step = d.problem ?? "";
  else if (s.corners.length < 4)
    step = `Tap corner ${s.corners.length + 1} of 4 of the ${d.reference.label}, in any order.`;
  else if (d.problem) step = d.problem;
  else if (adding >= 0 && !ext)
    step = `Tap corner ${s.extraRefs[adding].corners.length + 1} of 4 of reference ${adding + 2} (${s.extraRefs[adding].label}), in any order. Undo takes a corner back.`;
  else if (ext) step = ext.step(extensionEnv(s, d));
  else if (s.tool === "path" || s.tool === "area") {
    const n = open?.pts.length ?? 0,
      finish = s.tool === "area" ? "Close outline" : "Finish path";
    if (!n)
      step = `Tap each point of the ${s.tool === "area" ? "outline" : "path"} in order.`;
    else if (n < 3)
      step = `${n} point${n === 1 ? "" : "s"} placed. Tap at least ${3 - n} more.`;
    else step = `${n} points placed. Tap more, or press ${finish}.`;
  } else if (pending) step = "Tap the other end of the span.";
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
        only. The further a span is from every known size, the larger its error:
        for a room, add a second sheet or a tape-measured span under More known
        sizes. Points under the stage buttons cannot be tapped.
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
        {hasSource && still && paused ? (
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
        <button
          className="button"
          onClick={toolActive ? ext.undo : undo}
          disabled={isEmpty(s)}
        >
          Undo
        </button>
        <button className="button" onClick={clear} disabled={isEmpty(s)}>
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
      <ShapeTools s={s} ready={!!d.sheet} />
      {show && <KnownSizes s={s} d={d} />}
      <Results s={s} d={d} show={show} />
      {show && <TapeTest d={d} />}
      {EXTENSIONS.map((e) => (
        <e.Section key={e.tool} show={show} />
      ))}
      <PlanPanel s={s} d={d} show={show} />
      <LensSection s={s} d={d} />
      <ul className="ruler-guidance">
        <li>
          The long side of the reference is guessed from how it looks. If the
          labels on its edges are swapped, press Swap sides.
        </li>
        <li>
          For a whole room, one sheet of paper gives wide error bars, because
          the bar grows with distance from the reference. A second sheet a few
          metres away, or one span measured with a tape and used as a known
          span, tightens them: the surface is then solved from all of them
          together.
        </li>
        <li>
          To check a reading, type what a tape measure read beside it. The tape
          test lists each difference and says whether the tape value is inside
          the bar. It changes nothing unless you press Use as known span.
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
  Component: Ruler,
};
export default ruler;
