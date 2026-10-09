/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { REFERENCES } from "./references";
import { setCustom, setRef, type RulerState } from "./store";

/** Choose the known-size thing lying on the surface. Custom sides are in mm. */
export default function ReferencePicker({ s }: { s: RulerState }) {
  return (
    <section className="ruler-block" aria-label="Reference">
      <h3>Reference of known size</h3>
      <div className="ruler-group" role="group" aria-label="Reference size">
        {[...REFERENCES, { id: "custom", label: "Custom" }].map((r) => (
          <button
            key={r.id}
            className="button"
            aria-pressed={s.refId === r.id}
            onClick={() => setRef(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {s.refId === "custom" && (
        <div className="ruler-custom">
          <label>
            Side 1 (mm)
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              value={s.customA}
              onChange={(e) => setCustom(e.target.value, s.customB)}
            />
          </label>
          <label>
            Side 2 (mm)
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              value={s.customB}
              onChange={(e) => setCustom(s.customA, e.target.value)}
            />
          </label>
        </div>
      )}
    </section>
  );
}
