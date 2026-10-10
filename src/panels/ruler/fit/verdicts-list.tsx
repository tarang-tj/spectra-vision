/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Derived } from "../derive";
import type { RulerState } from "../state";
import type { BoxState } from "./box-state";
import { verdicts } from "./verdict";

/** The fit verdicts for the placed box, each with its bar, and what the bar
 * covers. Rendered only while the picture is still and is the one the points
 * were tapped on. */
export default function Verdicts({
  s,
  d,
  box,
}: {
  s: RulerState;
  d: Derived;
  box: BoxState;
}) {
  if (!box.at)
    return (
      <p className="ruler-note" data-testid="fit-hint">
        No box on the picture yet. Choose Box and tap the floor.
      </p>
    );
  const { rows, basis } = verdicts(s, d, box);
  if (!rows.length)
    return (
      <p className="ruler-note" data-testid="fit-hint">
        No verdict yet. Outline the space the box must fit in with Area, or
        measure a gap it must pass through with Span.
      </p>
    );
  return (
    <>
      <ol className="ruler-results" aria-label="Does the box fit">
        {rows.map((r) => (
          <li key={r.label} data-testid="fit-row">
            <span className="ruler-label">{r.label}</span>
            {r.verdicts.map((v, i) => (
              <output
                key={i}
                className={i ? "ruler-sub" : "ruler-value"}
                data-testid="fit-verdict"
                data-kind={v.kind}
                data-mm={v.mm}
                data-error-mm={v.errorMm}
                title={v.measured.basis}
              >
                {v.text}
              </output>
            ))}
            {r.reason && <p className="ruler-warn">{r.reason}</p>}
            {r.warnings.map((w) => (
              <p key={w} className="ruler-warn">
                {w}
              </p>
            ))}
          </li>
        ))}
      </ol>
      {basis && (
        <p className="ruler-basis" data-testid="fit-basis">
          {basis}
        </p>
      )}
      <p className="ruler-basis">
        A verdict is given only when the whole bar is on one side of zero.
        Otherwise it is too close to call from this picture.
      </p>
    </>
  );
}
