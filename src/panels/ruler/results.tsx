/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useStudio } from "../../studio-context";
import { resultsText, type Derived } from "./derive";
import { DEFAULT_SAMPLES, TAP_SIGMA_SCREEN_PX } from "./monte-carlo";
import ShapeResults from "./shape-results";
import type { RulerState } from "./store";
import TapeEntry from "./tape-entry";

/** Value ± error for each measurement, what the error covers, and a copy
 * button. Copying writes text to the clipboard; nothing is uploaded. */
export default function Results({
  s,
  d,
  show,
}: {
  s: RulerState;
  d: Derived;
  /** False when the picture is moving or there is none: any number shown then
   * would belong to a frame that is no longer on screen. */
  show: boolean;
}) {
  const { notice } = useStudio();
  async function copy() {
    try {
      await navigator.clipboard.writeText(resultsText(s, d));
      notice("Results copied.");
    } catch {
      notice("Copy was blocked by the browser. Select the results instead.");
    }
  }
  if (!show || (!d.rows.length && !d.shapes.length)) return null;
  return (
    <section className="ruler-block" aria-label="Results">
      <h3>Results</h3>
      <ol className="ruler-results">
        {d.rows.map((r) => (
          <li key={r.index} data-testid="ruler-result">
            <span className="ruler-label">Measurement {r.index + 1}</span>
            <output
              className="ruler-value"
              data-mm={r.span?.mm}
              data-error-mm={r.span?.errorMm}
            >
              {r.text}
            </output>
            {r.warnings.map((w) => (
              <p key={w} className="ruler-warn">
                {w}
              </p>
            ))}
            <TapeEntry s={s} d={d} index={r.index} />
          </li>
        ))}
        <ShapeResults rows={d.shapes} />
      </ol>
      <p className="ruler-basis">
        Each value is the direct geometric value from your taps. Its bar is 2
        standard deviations over {DEFAULT_SAMPLES} simulated tap errors of{" "}
        {TAP_SIGMA_SCREEN_PX} screen pixels, applied to every tapped point, the
        four reference corners included.
        {d.sheet?.fused &&
          " With more than one known size, every one of those simulations also moves the corners of each further reference, the ends of each known span and each typed length, and solves the whole surface again. In 300 simulated rooms with a second sheet in view, these bars held the true length 95 to 97 times in 100."}
      </p>
      <p className="ruler-basis" data-testid="ruler-basis">
        {d.basis}
      </p>
      <button className="button" onClick={() => void copy()}>
        Copy results
      </button>
    </section>
  );
}
