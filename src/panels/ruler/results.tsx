/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useStudio } from "../../studio-context";
import { resultsText, type Derived } from "./derive";
import { BASIS, DEFAULT_SAMPLES, TAP_SIGMA_SCREEN_PX } from "./monte-carlo";
import type { RulerState } from "./store";

/** Value ± error for each measurement, what the error covers, and a copy
 * button. Copying writes text to the clipboard; nothing is uploaded. */
export default function Results({ s, d }: { s: RulerState; d: Derived }) {
  const { notice } = useStudio();
  async function copy() {
    try {
      await navigator.clipboard.writeText(resultsText(s, d, BASIS));
      notice("Results copied.");
    } catch {
      notice("Copy was blocked by the browser. Select the results instead.");
    }
  }
  if (!d.rows.length) return null;
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
          </li>
        ))}
      </ol>
      <p className="ruler-basis">
        Each value is the distance between your taps. Its bar is 2 standard
        deviations over {DEFAULT_SAMPLES} simulated tap errors of{" "}
        {TAP_SIGMA_SCREEN_PX} screen pixels.
      </p>
      <p className="ruler-basis" data-testid="ruler-basis">
        {BASIS}
      </p>
      <button className="button" onClick={() => void copy()}>
        Copy results
      </button>
    </section>
  );
}
