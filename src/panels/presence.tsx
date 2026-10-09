/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useSyncExternalStore } from "react";
import { useStudio } from "../studio-context";
import { describeDevice, downloadText } from "./lab/environment";
import { drawHeadMarks } from "./presence/overlay";
import { presenceStore } from "./presence/presence-store";
import ResultsTable from "./presence/results-table";
import StripCharts from "./presence/strip-charts";
import { buildSummary, toJson, toMarkdown } from "./presence/summary";
import ThresholdInputs from "./presence/threshold-inputs";
import type { PanelDef } from "./types";
import "./lab/lab.css";
import "./presence/presence.css";

const subscribe = presenceStore.subscribe,
  read = presenceStore.getState;

function statusLine(state: ReturnType<typeof read>, paused: boolean): string {
  if (state.phase === "calibrating")
    return paused
      ? "Stage paused. Calibration waits."
      : `Hold still and look at the camera. Keep your hands in view if you want hand movement measured. ${Math.max(0, Math.ceil((state.calibrationMs - state.calibratedMs) / 1000))} s left.`;
  if (state.phase === "measuring")
    return paused
      ? "Stage paused. Measuring waits, and paused time is left out."
      : "Measuring. Stop when you are done.";
  if (state.phase === "done")
    return state.endReason === "limit"
      ? "Stopped by itself: a session ends after 40,000 results of one model (about 45 minutes). This is what was measured until then."
      : state.endReason === "source" || state.endReason === "mode"
        ? "Stopped because the source or mode changed. This is what was measured until then."
        : "Stopped. Nothing is saved unless you export it.";
  return state.endReason
    ? "Calibration was cancelled. Nothing was measured."
    : "Start, then hold still and look at the camera for a few seconds. A session ends by itself after about 45 minutes. Nothing is uploaded or saved unless you export it.";
}

/** Measures how a person presents on camera in Fusion mode. A measuring
 * instrument: every figure carries its error, and nothing is scored or judged.
 * The session lives in a module-level store, so it goes on while another tab is open. */
function Presence() {
  const studio = useStudio(),
    { stage, mode, frame, paused } = studio,
    state = useSyncExternalStore(subscribe, read);
  useEffect(
    () =>
      stage.addOverlay((ctx, f) => {
        const o = presenceStore.overlay();
        if (o)
          drawHeadMarks(
            ctx,
            f,
            o.face,
            o.baseline,
            read().thresholds.headAngle,
          );
      }),
    [stage],
  );
  const heading = (
    <h2 className="presence-title">
      Presence <span className="presence-beta">Beta</span>
    </h2>
  );
  if (mode.id !== "fusion" && state.phase === "idle" && state.rows.length === 0)
    return (
      <div className="lab-panel presence-panel">
        {heading}
        <p className="lab-note">
          Presence reads the body, hand and face models together, which only
          Fusion mode runs.
        </p>
        <button
          className="button primary"
          onClick={() => studio.setMode("fusion")}
        >
          Switch to Fusion
        </button>
      </div>
    );
  const running = state.phase === "calibrating" || state.phase === "measuring",
    save = (extension: "json" | "md") => {
      const summary = buildSummary({
        startedAt: state.startedAt ?? new Date(0).toISOString(),
        endReason: state.endReason,
        calibrationMs: state.calibrationMs,
        shortened: presenceStore.shortened(),
        pauses: state.pauses,
        thresholds: state.thresholds,
        baseline: state.baseline,
        models: state.models,
        rows: state.rows,
        device: describeDevice(),
      });
      downloadText(
        `spectra-presence.${extension}`,
        extension === "json" ? "application/json" : "text/markdown",
        extension === "json"
          ? toJson(summary)
          : toMarkdown(summary, state.rows),
      );
      studio.notice("Presence summary exported.");
    };
  return (
    <div className="lab-panel presence-panel">
      {heading}
      <p className="lab-note">
        Measured in this browser, on this device. It reports numbers about head
        direction, hands and body movement, each with its error. It does not
        score, grade or advise.
      </p>
      <button
        className={`button ${running ? "" : "primary"}`}
        disabled={!running && (!frame.source || mode.id !== "fusion")}
        onClick={() => {
          if (running) presenceStore.stop();
          else if (!presenceStore.start(frame.aspect))
            studio.notice("Choose a source first.");
        }}
      >
        {running ? "Stop" : state.phase === "done" ? "Start again" : "Start"}
      </button>
      <p
        className="presence-status"
        aria-live="polite"
        data-testid="presence-status"
      >
        {statusLine(state, paused)}
      </p>
      {(running || state.phase === "done") && <StripCharts state={state} />}
      <section className="lab-block">
        <header>
          <h3>Thresholds</h3>
        </header>
        <ThresholdInputs values={state.thresholds} />
        <p className="lab-note">
          Stated, not tuned: each figure below uses these. Change one and the
          figures are recomputed from what was recorded.
        </p>
      </section>
      {state.rows.length > 0 && (
        <section className="lab-block">
          <header>
            <h3>{state.phase === "done" ? "Summary" : "So far"}</h3>
          </header>
          <ResultsTable rows={state.rows} />
          <p className="lab-note">
            Values are shown as value ± error. "Not seen" means the model never
            found what the figure needs; it is not zero.
          </p>
        </section>
      )}
      {state.phase === "done" && (
        <div className="lab-exports">
          <button className="button compact" onClick={() => save("json")}>
            Export JSON
          </button>
          <button className="button compact" onClick={() => save("md")}>
            Export Markdown
          </button>
          <button
            className="button compact"
            onClick={() => presenceStore.clear()}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}

const presence: PanelDef = {
  id: "presence",
  label: "Presence",
  order: 50,
  Component: Presence,
};
export default presence;
