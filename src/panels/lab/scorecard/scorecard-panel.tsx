/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadText } from "../../../download";
import { useStudio } from "../../../studio-context";
import { testHooksEnabled } from "../../../test-hooks";
import { gpuUnavailable } from "../../../vision/delegate";
import {
  SHARPER_MODEL,
  sharperOffered,
} from "../../../vision/detector/sharper";
import type { Delegate } from "../../../vision/types";
import { describeDevice, hashModel, modelCard } from "../environment";
import { drawWeights } from "./bootstrap";
import {
  basisOf,
  captionOf,
  cellsOf,
  comparisonsOf,
  toJson,
  toMarkdown,
} from "./score-markdown";
import { buildReport, prepare, type Prepared } from "./score-report";
import { runScorecard, type Progress, type RunResult } from "./score-run";
import { fetchPicture, fetchSet } from "./score-set";
import * as words from "./score-wording";
import { MODELS, openScoreWorker, targetsFor } from "./score-worker";
import ScorecardViewer from "./scorecard-viewer";
import "./scorecard.css";

// The e2e suite shortens the run through this hook, which is read only on a
// page opened with `?spectra-test`. `gpu` lets the GPU box be ticked where
// the page knows there is none, so the refusal can be seen. A shortened run
// says so on the page and in both exports.
type TestFlag = { pictures?: number; gpu?: boolean };
const testFlag = (): TestFlag =>
  (testHooksEnabled() &&
    (window as Window & { __spectraScoreTest?: TestFlag })
      .__spectraScoreTest) ||
  {};

type Scored = {
  result: RunResult;
  prepared: Prepared[];
  weights: Uint16Array[];
  startedAt: string;
};
// The last scorecard survives closing and reopening the Lab tab. What the
// page knows of the set is kept too, once its list has been read.
let lastScored: Scored | null = null,
  lastFacts: words.SetFacts | null = null;
const bytesOf = (file: string) => modelCard(file)?.bytes ?? null;
const toggle = <T,>(list: T[], item: T) =>
  list.includes(item) ? list.filter((i) => i !== item) : [...list, item];

/** The scorecard: its controls, the results table with its caption and basis
 * lines, the paired comparisons, the by-class rows, the viewer and exports. */
export default function Scorecard() {
  const studio = useStudio(),
    live = useRef(studio),
    stopper = useRef<AbortController | null>(null),
    flag = testFlag(),
    noGpu = flag.gpu ? null : gpuUnavailable(),
    sharp = sharperOffered(),
    [models, setModels] = useState<string[]>([MODELS[0].file, MODELS[1].file]),
    [delegates, setDelegates] = useState<Delegate[]>(
      noGpu ? ["CPU"] : ["CPU", "GPU"],
    ),
    [progress, setProgress] = useState(""),
    [running, setRunning] = useState(false),
    [facts, setFacts] = useState(lastFacts),
    [scored, setScored] = useState(lastScored),
    confidence = studio.frame.settings.confidence,
    base = new URL(import.meta.env.BASE_URL, location.href).href;
  live.current = studio;
  // Leaving the Lab stops a run; the run loop then puts the stage back.
  useEffect(() => () => stopper.current?.abort(), []);
  // Moving the Confidence slider re-scores Found and Right; no model runs.
  const report = useMemo(
    () =>
      scored &&
      buildReport(scored.result, scored.prepared, scored.weights, confidence, {
        startedAt: scored.startedAt,
        device: describeDevice(),
        pinned: (file) => modelCard(file)?.sha256 || null,
      }),
    [scored, confidence],
  );

  const run = async () => {
    const control = new AbortController(),
      startedAt = new Date().toISOString();
    let short: words.Shortened = null;
    stopper.current = control;
    setRunning(true);
    const say = (state: Progress) =>
      setProgress(
        state.step === "list"
          ? words.progressText.list
          : state.step === "loading"
            ? words.progressText.loading(
                state.target.label,
                state.target.delegate,
              )
            : words.progressText.picture(
                state.target.label,
                state.target.delegate,
                state.index,
                state.of,
              ) + words.shortenedNote(short),
      );
    try {
      const result = await runScorecard(
        targetsFor(models, delegates, bytesOf),
        {
          fetchSet: async (signal) => {
            const set = await fetchSet(base, signal),
              { pictures, boxes, bytes } = set;
            lastFacts = {
              pictures,
              boxes,
              bytes,
              checked: set.items[0].checked,
            };
            setFacts(lastFacts);
            if (flag.pictures && flag.pictures < pictures)
              short = { scored: flag.pictures, of: pictures };
            return set;
          },
          fetchPicture: (item, signal) => fetchPicture(base, item, signal),
          bitmap: (blob) => createImageBitmap(blob),
          open: (target) => openScoreWorker(target, base),
          hash: hashModel,
          refused: (target) => {
            const reason = target.delegate === "GPU" ? gpuUnavailable() : null;
            return reason ? `GPU not available: ${reason}` : null;
          },
          paused: () => live.current.paused,
          setPaused: (value) => live.current.setPaused(value),
        },
        control.signal,
        say,
        flag.pictures,
      );
      if (result.runs.length) {
        setProgress(words.progressText.intervals);
        const weights = drawWeights(result.items.length);
        lastScored = {
          result,
          weights,
          startedAt,
          prepared: await prepare(result, weights),
        };
        setScored(lastScored);
      }
      setProgress(
        result.stopped
          ? words.progressText.stopped
          : words.progressText.finished(result.runs.length),
      );
    } catch (error) {
      console.error("[spectra lab] scorecard failed", error);
      setProgress(
        control.signal.aborted
          ? words.progressText.stopped
          : words.progressText.failed(
              error instanceof Error ? error.message : String(error),
            ),
      );
    } finally {
      setRunning(false);
    }
  };
  const save = (extension: "json" | "md") => {
    if (!report) return;
    downloadText(
      `spectra-scorecard.${extension}`,
      extension === "json" ? toJson(report) : toMarkdown(report),
      extension === "json" ? "application/json" : "text/markdown",
    );
    studio.notice("Scorecard exported.");
  };

  return (
    <section className="lab-block" data-testid="scorecard">
      <header>
        <h3>Scorecard</h3>
      </header>
      <p className="lab-note">{words.intro(facts)}</p>
      <fieldset className="lab-picks" disabled={running}>
        <legend>Models</legend>
        {MODELS.map(({ file, label }) => {
          const sharper = file === SHARPER_MODEL,
            size = bytesOf(file);
          return (
            <label key={file}>
              <input
                type="checkbox"
                disabled={sharper && !sharp}
                checked={models.includes(file)}
                onChange={() => setModels(toggle(models, file))}
              />
              {label}
              {size ? ` (${words.megabytes(size)} MB` : " ("}
              {sharper
                ? `${size ? ", " : ""}GPU only)`
                : size
                  ? ")"
                  : "size not listed)"}
              {sharper && !sharp
                ? " Sharper is not offered on this device."
                : ""}
            </label>
          );
        })}
      </fieldset>
      <fieldset className="lab-picks" disabled={running}>
        <legend>Run on</legend>
        {(["CPU", "GPU"] as Delegate[]).map((delegate) => (
          <label key={delegate}>
            <input
              type="checkbox"
              disabled={delegate === "GPU" && !!noGpu}
              checked={delegates.includes(delegate)}
              onChange={() => setDelegates(toggle(delegates, delegate))}
            />
            {delegate}
            {delegate === "GPU" && noGpu ? ` GPU not available: ${noGpu}` : ""}
          </label>
        ))}
      </fieldset>
      <button
        className="button compact lab-run"
        disabled={!running && !targetsFor(models, delegates).length}
        onClick={running ? () => stopper.current?.abort() : run}
      >
        {running ? "Stop scorecard" : "Run scorecard"}
      </button>
      <p className="lab-note" aria-live="polite" data-testid="score-progress">
        {progress}
      </p>
      <p className="lab-note">{words.UNDER_BUTTON}</p>
      {report && scored && (
        <>
          <table className="lab-table" data-testid="score-results">
            <thead>
              <tr>
                {[
                  "Run",
                  "Found",
                  "Right",
                  "AP50",
                  "AP50:95",
                  "ms a picture",
                ].map((name) => (
                  <th scope="col" key={name}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.runs.map((row) => (
                <tr key={row.id}>
                  <th scope="row">
                    {row.label}
                    <small>
                      {row.status === "ok"
                        ? `on ${row.delegate}`
                        : `on ${row.delegate}, ${words.didNotRun(row.note)}`}
                    </small>
                  </th>
                  {cellsOf(row, report).map((cell, i) => (
                    <td key={i}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="lab-note" data-testid="score-caption">
            {captionOf(report)}
          </p>
          <ul className="lab-note score-basis">
            {basisOf(report).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {report.comparisons.length > 0 && (
            <>
              <h4>Compared on the same pictures</h4>
              {comparisonsOf(report).map((line) => (
                <p className="lab-note" key={line}>
                  {line}
                </p>
              ))}
            </>
          )}
          <details>
            <summary>By class</summary>
            {report.byClass.length > 0 && (
              <table className="lab-table">
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col">Labelled</th>
                    {report.runs.map((row) => (
                      <th scope="col" key={row.id}>
                        Found, {row.label} on {row.delegate}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.byClass.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      <td>{row.labelled}</td>
                      {row.found.map((figure, i) => (
                        <td key={i}>
                          {figure
                            ? words.shareCell(
                                figure,
                                "objects",
                                words.NOT_MEASURED,
                              )
                            : words.NOT_MEASURED}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="lab-note">
              {words.otherClasses(report.otherClasses)}
            </p>
          </details>
          <ScorecardViewer
            result={scored.result}
            confidence={confidence}
            base={base}
          />
          <div className="lab-exports">
            <button className="button compact" onClick={() => save("json")}>
              Export JSON
            </button>
            <button className="button compact" onClick={() => save("md")}>
              Export Markdown
            </button>
          </div>
        </>
      )}
    </section>
  );
}
