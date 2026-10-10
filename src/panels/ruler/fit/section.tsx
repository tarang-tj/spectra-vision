/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { cameraOf } from "../camera-of";
import { derive } from "../derive";
import { useRuler } from "../state";
import { fromMm, toMm } from "../units";
import {
  EXAMPLES,
  MAX_SIDE_MM,
  nudge,
  removeBox,
  setExample,
  setRotation,
  setSize,
  turnBy,
  useBox,
} from "./box-state";
import { sizeText } from "./draw";
import NumberField from "./number-field";
import Verdicts, { VerdictBasis } from "./verdicts-list";
import "./fit.css";

const SIDES = [
  ["w", "Width"],
  ["d", "Depth"],
  ["h", "Height"],
] as const;

/** The Box tool's part of the Ruler panel: the box's size, turn and place,
 * and whether it fits. Shown while the tool is chosen or a box is placed. */
export default function BoxSection({ show }: { show: boolean }) {
  const s = useRuler(),
    box = useBox(),
    d = derive(s);
  if (s.tool !== "box" && !box.at) return null;
  const camera = cameraOf(s, d),
    { unit } = s,
    // One nudge: a centimetre, or an inch in the inch and foot units.
    stepMm = unit === "in" || unit === "ft" ? 25.4 : 10,
    step = sizeText(stepMm, unit);
  return (
    <section className="ruler-block" aria-label="Box">
      <h3>Box</h3>
      {show && <Verdicts s={s} d={d} box={box} />}
      <p className="ruler-note">
        A box of the size you type, stood on the same surface as the reference.
        Tap the floor to stand it there. Outline the space with Area, or measure
        a gap with Span, to learn whether it fits.
      </p>
      <div className="ruler-custom fit-size" role="group" aria-label="Box size">
        {SIDES.map(([side, name]) => (
          <NumberField
            key={side}
            label={`${name} (${unit})`}
            value={fromMm(box[side], unit)}
            usable={(v) => v > 0 && toMm(v, unit) <= MAX_SIDE_MM}
            onValue={(v) => setSize(side, toMm(v, unit))}
          />
        ))}
      </div>
      <div className="ruler-group" role="group" aria-label="Example sizes">
        {EXAMPLES.map((e, i) => (
          <button key={e.name} className="button" onClick={() => setExample(i)}>
            Example: {e.name},{" "}
            {[e.w, e.d, e.h].map((mm) => sizeText(mm, unit)).join(" x ")}
          </button>
        ))}
      </div>
      <div className="ruler-custom" role="group" aria-label="Turn the box">
        <NumberField
          label="Turn (degrees)"
          value={box.rot}
          step="1"
          usable={(v) => Math.abs(v) <= 360}
          onValue={(v) => setRotation(v)}
        />
        <button className="button" onClick={() => turnBy(-15)}>
          Turn -15°
        </button>
        <button className="button" onClick={() => turnBy(15)}>
          Turn +15°
        </button>
      </div>
      <div
        className="ruler-group"
        role="group"
        aria-label={`Nudge the box by ${step}`}
      >
        {(
          [
            ["Along width -", -1, 0],
            ["Along width +", 1, 0],
            ["Along depth -", 0, -1],
            ["Along depth +", 0, 1],
          ] as const
        ).map(([name, along, across]) => (
          <button
            key={name}
            className="button"
            disabled={!box.at}
            title={`Move the box ${step}`}
            onClick={() => nudge(along * stepMm, across * stepMm)}
          >
            {name}
          </button>
        ))}
        <button className="button" disabled={!box.at} onClick={removeBox}>
          Remove box
        </button>
      </div>
      {d.sheet && !camera?.focalResolved && (
        <p className="ruler-warn" data-testid="fit-no-height">
          The box's height is not drawn, only its footprint. This picture does
          not pin down the camera's focal length, so anything above the floor
          would be a guess. Take the picture with the camera tilted down at the
          floor, or mark a plumb edge. The fit verdict uses the footprint only
          and is not affected.
        </p>
      )}
      {show && <VerdictBasis s={s} d={d} box={box} />}
    </section>
  );
}
