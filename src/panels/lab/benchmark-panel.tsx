/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import { modes } from "../../modes";
import { useStudio } from "../../studio-context";
import { MIN_FRAME_GAP } from "../../vision/task-runner";
import type { Delegate } from "../../vision/types";
import { MEASURE_MS, WARMUP_MS, runBenchmark } from "./benchmark";
import { toJson, toMarkdown } from "./benchmark-report";
import type { BenchReport } from "./benchmark-report";
import { describeDevice, downloadText, stageCanvasSize } from "./environment";
import { figure } from "./live-charts";

// The e2e suite shortens the run through this hook. A shortened run says so
// in the panel and in both exports; it is never presented as the standard one.
type TestFlag = { measureMs?: number; warmupMs?: number };
const testFlag = (): TestFlag =>
  (window as Window & { __spectraLabTest?: TestFlag }).__spectraLabTest ?? {};

// The last report survives closing and reopening the Lab tab.
let lastReport: BenchReport | null = null;

/** The benchmark controls, its results table and the two exports. */
export default function BenchmarkPanel() {
  const studio = useStudio(),
    live = useRef(studio),
    stopper = useRef<AbortController | null>(null),
    [chosen, setChosen] = useState<string[]>([studio.mode.id]),
    [delegates, setDelegates] = useState<Delegate[]>(["CPU", "GPU"]),
    [progress, setProgress] = useState(""),
    [running, setRunning] = useState(false),
    [report, setReport] = useState(lastReport);
  live.current = studio;
  // Leaving the Lab stops a run; the engine then restores mode and delegates.
  useEffect(() => () => stopper.current?.abort(), []);

  const flag = testFlag(),
    measureMs = flag.measureMs ?? MEASURE_MS,
    warmupMs = flag.warmupMs ?? WARMUP_MS,
    blocked = !studio.frame.source
      ? "Choose a source first."
      : studio.paused
        ? "Resume detection first."
        : !chosen.length || !delegates.length
          ? "Pick at least one mode and one delegate."
          : "";
  const toggle = <T,>(list: T[], item: T) =>
    list.includes(item) ? list.filter((i) => i !== item) : [...list, item];

  const run = async () => {
    const control = new AbortController();
    stopper.current = control;
    setRunning(true);
    const next: BenchReport = {
      app: "SPECTRA",
      kind: "benchmark",
      schema: 1,
      startedAt: new Date().toISOString(),
      protocol: {
        measureMs,
        warmupMs,
        shortened: measureMs !== MEASURE_MS || warmupMs !== WARMUP_MS,
        inferenceCapFps: Math.round(10000 / MIN_FRAME_GAP) / 10,
        notes:
          "Fixed source: the one on the stage (each mode's own demo input when the demo is in use). The warm-up starts at the first result after the model is ready.",
      },
      device: describeDevice(),
      canvas: stageCanvasSize(),
      rows: [],
    };
    try {
      next.rows = await runBenchmark(
        {
          modes: modes.filter((mode) => chosen.includes(mode.id)),
          delegates,
          measureMs,
          warmupMs,
        },
        {
          mode: () => live.current.mode,
          setMode: (id) => live.current.setMode(id),
          paused: () => live.current.paused,
          source: () => live.current.frame.source,
        },
        control.signal,
        setProgress,
      );
      // A stopped benchmark keeps the runs that finished before the stop.
      lastReport = next;
      setReport(next);
      setProgress(
        `${control.signal.aborted ? "Stopped after" : "Finished"} ${next.rows.length} runs.`,
      );
    } catch (error) {
      console.error("[spectra lab] benchmark failed", error);
      setProgress("Benchmark failed. See the console.");
    } finally {
      setRunning(false);
    }
  };
  const save = (extension: "json" | "md") => {
    if (!report) return;
    downloadText(
      `spectra-benchmark.${extension}`,
      extension === "json" ? "application/json" : "text/markdown",
      extension === "json" ? toJson(report) : toMarkdown(report),
    );
    studio.notice("Benchmark exported.");
  };

  return (
    <section className="lab-block">
      <header>
        <h3>Benchmark</h3>
      </header>
      <fieldset className="lab-picks" disabled={running}>
        <legend>Modes</legend>
        {modes.map((mode) => (
          <label key={mode.id}>
            <input
              type="checkbox"
              checked={chosen.includes(mode.id)}
              onChange={() => setChosen(toggle(chosen, mode.id))}
            />
            {mode.short}
          </label>
        ))}
      </fieldset>
      <fieldset className="lab-picks" disabled={running}>
        <legend>Delegates</legend>
        {(["CPU", "GPU"] as Delegate[]).map((delegate) => (
          <label key={delegate}>
            <input
              type="checkbox"
              checked={delegates.includes(delegate)}
              onChange={() => setDelegates(toggle(delegates, delegate))}
            />
            {delegate}
          </label>
        ))}
      </fieldset>
      <button
        className="button compact lab-run"
        disabled={!running && !!blocked}
        onClick={running ? () => stopper.current?.abort() : run}
      >
        {running ? "Stop benchmark" : "Run benchmark"}
      </button>
      <p className="lab-note" aria-live="polite" data-testid="lab-progress">
        {running ? progress : blocked || progress}
      </p>
      <p className="lab-note">
        Each run measures {measureMs / 1000} s on the current source after a{" "}
        {warmupMs / 1000} s warm-up that is not counted
        {measureMs !== MEASURE_MS ? " (shortened test run)" : ""}. Inference is
        capped at {(1000 / MIN_FRAME_GAP).toFixed(1)} results a second. The mode
        changes while it runs and is put back afterwards.
      </p>
      {report && (
        <>
          <table className="lab-table" data-testid="lab-results">
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col">p50</th>
                <th scope="col">p95</th>
                <th scope="col">max</th>
                <th scope="col">FPS</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.flatMap((row) =>
                (row.tasks.length ? row.tasks : [null]).map((task, index) => (
                  <tr key={`${row.mode}-${row.delegateRequested}-${index}`}>
                    <th scope="row">
                      {row.modeLabel}
                      {task && row.tasks.length > 1 ? ` ${task.kind}` : ""}
                      <small>
                        {task && task.delegateActive !== row.delegateRequested
                          ? `asked ${row.delegateRequested}, ran ${task.delegateActive ?? "nothing"}`
                          : `on ${row.delegateRequested}`}
                        {row.status === "ok" ? "" : `: ${row.note}`}
                      </small>
                    </th>
                    <td>{figure(task?.p50)}</td>
                    <td>{figure(task?.p95)}</td>
                    <td>{figure(task?.max)}</td>
                    <td>{index ? "" : figure(row.processedFps)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
          <p className="lab-note">
            Latency in ms; FPS is processed results a second. Measured{" "}
            {report.protocol.measureMs / 1000} s per run
            {report.protocol.shortened ? " (shortened test run)" : ""}.
          </p>
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
