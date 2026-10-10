/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";
import type { Derived } from "./derive";
import { DEFAULT_TAPE_SD_MM } from "./derive-known";
import { customReference, REFERENCES } from "./references";
import {
  addReference,
  pendingRef,
  removeReference,
  setTapeSd,
  type RulerState,
} from "./store";

/** Further known sizes on the same surface: more references to tap, and the
 * tape uncertainty that goes with typed lengths. Everything usable is solved
 * together with the first reference as one surface. */
export default function KnownSizes({ s, d }: { s: RulerState; d: Derived }) {
  const [size, setSize] = useState("letter"),
    [a, setA] = useState(""),
    [b, setB] = useState(""),
    next =
      size === "custom"
        ? customReference(Number(a), Number(b))
        : (REFERENCES.find((r) => r.id === size) ?? null),
    tapping = pendingRef(s) >= 0;
  if (!d.known) return null;
  return (
    <section className="ruler-block" aria-label="More known sizes">
      <h3>More known sizes</h3>
      <p className="ruler-note">
        One sheet measures well near itself and poorly across a room. Add
        another sheet or rectangle of known size lying on the same surface, or
        type a tape-measured length beside a span under Results and press Use as
        known span. All of them are solved together as one surface.
      </p>
      <div
        className="ruler-group"
        role="group"
        aria-label="Next reference size"
      >
        {[...REFERENCES, { id: "custom", label: "Custom" }].map((r) => (
          <button
            key={r.id}
            className="button"
            aria-pressed={size === r.id}
            onClick={() => setSize(r.id)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {size === "custom" && (
        <div className="ruler-custom">
          <label>
            Next reference side 1 (mm)
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              value={a}
              onChange={(e) => setA(e.target.value)}
            />
          </label>
          <label>
            Next reference side 2 (mm)
            <input
              type="number"
              inputMode="decimal"
              min="1"
              step="any"
              value={b}
              onChange={(e) => setB(e.target.value)}
            />
          </label>
        </div>
      )}
      <button
        className="button"
        disabled={!next || tapping}
        onClick={() => next && addReference(next)}
      >
        Add reference
      </button>
      {d.known.refs.length > 0 && (
        <ul className="ruler-known" aria-label="Further references">
          {d.known.refs.map((r, i) => (
            <li key={i}>
              <span className={r.warn ? "ruler-warn" : "ruler-basis"}>
                {r.text}
              </span>
              <button
                className="button"
                aria-label={`Remove reference ${i + 2}`}
                onClick={() => removeReference(i)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ruler-custom">
        <label>
          Tape uncertainty (mm)
          <input
            type="text"
            inputMode="decimal"
            value={s.tapeSd}
            onChange={(e) => setTapeSd(e.target.value)}
          />
        </label>
      </div>
      <p className="ruler-basis">
        How far a typed tape length may be off, as one standard deviation
        (default {DEFAULT_TAPE_SD_MM} mm). It widens the bars of everything
        solved from a known span.
      </p>
      {d.known.tapeSdProblem && (
        <p className="ruler-warn">{d.known.tapeSdProblem}</p>
      )}
      {d.known.warnings.map((w) => (
        <p key={w} className="ruler-warn">
          {w}
        </p>
      ))}
      <p className="ruler-basis" role="status" data-testid="ruler-fused">
        {d.known.summary ??
          "The surface is solved from the first reference alone."}
      </p>
    </section>
  );
}
