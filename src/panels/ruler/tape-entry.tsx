/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Derived } from "./derive";
import { tapeMm } from "./derive-known";
import { setKnown, setTape, type RulerState } from "./store";

/** Beside one span: what a tape measure read for it. Typing a reading only
 * checks the span against it. Use as known span feeds the typed length into
 * the solve of the surface. */
export default function TapeEntry({
  s,
  d,
  index,
}: {
  s: RulerState;
  d: Derived;
  index: number;
}) {
  const m = s.measures[index];
  if (!m) return null;
  const unit = m.tapeUnit ?? s.unit,
    check = d.tape.checks.find((c) => c.index === index);
  return (
    <div className="ruler-tape">
      <label>
        Tape reading ({unit})
        <input
          type="text"
          inputMode="decimal"
          aria-label={`Tape reading for measurement ${index + 1}, in ${unit}`}
          value={m.tape ?? ""}
          onChange={(e) => setTape(index, e.target.value)}
        />
      </label>
      <button
        className="button"
        aria-pressed={!!m.known}
        aria-label={`Use measurement ${index + 1} as known span`}
        disabled={!m.known && tapeMm(m, s) === null}
        onClick={() => setKnown(index, !m.known)}
      >
        Use as known span
      </button>
      {check && (
        <p
          className={check.inside === false ? "ruler-warn" : "ruler-basis"}
          data-testid="ruler-tape-check"
        >
          {[check.difference && `Reading minus tape: ${check.difference}`]
            .concat(check.verdict)
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
    </div>
  );
}
