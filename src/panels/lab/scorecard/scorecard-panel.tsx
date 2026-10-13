/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useMemo, useRef, useState } from "react";
import { downloadText } from "../../../download";
import { useStudio } from "../../../studio-context";
import { testHooksEnabled } from "../../../test-hooks";
import { gpuUnavailable } from "../../../vision/delegate";
import { sharperOffered } from "../../../vision/detector/sharper";
import type { Delegate } from "../../../vision/types";
import { describeDevice, hashModel, modelCard } from "../environment";
import { drawWeights } from "./bootstrap";
import { toJson, toMarkdown } from "./score-markdown";
import { prepare, type Prepared } from "./score-prepare";
import { buildReport } from "./score-report";
import { runScorecard, type Progress, type RunResult } from "./score-run";
import { fetchPicture, fetchSet } from "./score-set";
import * as words from "./score-wording";
import { MODELS, openScoreWorker, targetsFor } from "./score-worker";
import ScorecardPicks from "./scorecard-picks";
import ScorecardTables from "./scorecard-tables";
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
      setProgress(words.progressOf(state, short));
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
      <ScorecardPicks
        models={models}
        setModels={setModels}
        delegates={delegates}
        setDelegates={setDelegates}
        sharp={sharp}
        noGpu={noGpu}
        running={running}
        bytesOf={bytesOf}
      />
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
          <ScorecardTables report={report} />
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
