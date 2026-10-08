/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import { tasksOf } from "../../modes";
import { DROP_FACTOR } from "../../telemetry/stats";
import { taskStatus } from "../../telemetry/task-status";
import { chooseDelegate, requestedDelegate } from "../../vision/delegate";
import type { Delegate, TaskSpec } from "../../vision/types";
import { useStudio } from "../../studio-context";
import { CHART, drawChart } from "./charts";
import { HISTORY_MS, RATE_SPAN_MS, WINDOW_MS, openLabStore } from "./lab-store";
import type { LabSnapshot } from "./lab-store";

const DELEGATES: Delegate[] = ["CPU", "GPU"];
/** A measured figure, or the plain statement that there is none yet. */
export const figure = (value: number | null | undefined, digits = 1) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(digits)
    : "no data";

function Stat(props: { label: string; value: string; id: string }) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd data-testid={props.id}>{props.value}</dd>
    </div>
  );
}

/** What one task is really running on, from the runner's own record. */
function delegateLine(spec: TaskSpec) {
  const status = taskStatus(spec.kind, spec.model);
  if (!status) return "Not started.";
  if (status.state === "failed") return `Failed: ${status.note}`;
  if (status.state === "loading")
    return `Loading on ${status.active}. ${status.note}`.trim();
  if (status.note) return status.note;
  return status.firstResultMs === null
    ? `Loaded on ${status.active}, no result yet.`
    : `Running on ${status.active}.`;
}

/** Live latency and frame-rate charts for the current mode. Subscribes to the
 * telemetry bus while mounted and is redrawn by the stage's frame events, so
 * a closed Lab tab costs nothing. */
export default function LiveCharts() {
  const { mode } = useStudio(),
    specs = tasksOf(mode),
    canvases = useRef(new Map<string, HTMLCanvasElement | null>()),
    [snapshot, setSnapshot] = useState<LabSnapshot | null>(null),
    [, redraw] = useState(0);
  useEffect(() => {
    setSnapshot(null);
    const kinds = tasksOf(mode).map((spec) => spec.kind);
    const store = openLabStore(kinds, (next, live) => {
      for (const kind of kinds)
        drawChart(canvases.current.get(kind) ?? null, {
          series: [
            { samples: live.latencySamples(kind, next.now), color: CHART.line },
          ],
          guides: [
            { value: next.latency[kind]?.p50 ?? NaN, color: CHART.second },
            { value: next.latency[kind]?.p95 ?? NaN, color: CHART.third },
          ],
          now: next.now,
          spanMs: WINDOW_MS,
          unit: "ms",
        });
      drawChart(canvases.current.get("rate") ?? null, {
        series: [
          { samples: live.history("render", next.now), color: CHART.second },
          { samples: live.history("processed", next.now), color: CHART.line },
        ],
        guides: [],
        now: next.now,
        spanMs: HISTORY_MS,
        unit: "fps",
      });
      setSnapshot(next);
    });
    return () => store.close();
  }, [mode]);
  const keep = (key: string) => (element: HTMLCanvasElement | null) => {
    canvases.current.set(key, element);
  };
  const interval = snapshot?.frameInterval;
  return (
    <>
      {specs.map((spec) => {
        const stats = snapshot?.latency[spec.kind],
          requested = requestedDelegate(spec);
        return (
          <section className="lab-block" key={spec.kind}>
            <header>
              <h3>{spec.kind} latency</h3>
              <span className="lab-switch" role="group" aria-label="Delegate">
                {DELEGATES.map((delegate) => (
                  <button
                    key={delegate}
                    aria-pressed={requested === delegate}
                    aria-label={`Run ${spec.kind} on ${delegate}`}
                    onClick={() => {
                      chooseDelegate(spec.kind, delegate);
                      redraw((n) => n + 1);
                    }}
                  >
                    {delegate}
                  </button>
                ))}
              </span>
            </header>
            <p
              className="lab-note"
              aria-live="polite"
              data-testid={`lab-delegate-${spec.kind}`}
            >
              {delegateLine(spec)}
            </p>
            <canvas
              ref={keep(spec.kind)}
              role="img"
              aria-label={`${spec.kind} inference latency over the last ${WINDOW_MS / 1000} seconds`}
            />
            <dl className="lab-stats">
              <Stat
                label="p50 ms"
                value={figure(stats?.p50)}
                id={`lab-p50-${spec.kind}`}
              />
              <Stat
                label="p95 ms"
                value={figure(stats?.p95)}
                id={`lab-p95-${spec.kind}`}
              />
              <Stat
                label="max ms"
                value={figure(stats?.max)}
                id={`lab-max-${spec.kind}`}
              />
              <Stat
                label="samples"
                value={String(stats?.count ?? 0)}
                id={`lab-count-${spec.kind}`}
              />
            </dl>
          </section>
        );
      })}
      <section className="lab-block">
        <header>
          <h3>Frame rate</h3>
        </header>
        <canvas
          ref={keep("rate")}
          role="img"
          aria-label={`Processed and render frames per second over the last ${HISTORY_MS / 1000} seconds`}
        />
        <dl className="lab-stats">
          <Stat
            label="processed"
            value={figure(snapshot?.processedFps)}
            id="lab-processed-fps"
          />
          <Stat
            label="render"
            value={figure(snapshot?.renderFps)}
            id="lab-render-fps"
          />
          <Stat
            label="dropped"
            value={snapshot ? String(snapshot.dropped) : "no data"}
            id="lab-dropped"
          />
        </dl>
        <p className="lab-note">
          Figures cover the last {WINDOW_MS / 1000} s. Mint is processed, blue
          is render; each chart point is the rate over the {RATE_SPAN_MS / 1000}{" "}
          s before it. A dropped frame is a gap over {DROP_FACTOR} times the
          median frame interval
          {Number.isFinite(interval) ? ` (${figure(interval)} ms)` : ""}.
        </p>
        <p className="lab-note" data-testid="lab-cost">
          Lab cost: mean {figure(snapshot?.costMean, 3)} ms, worst{" "}
          {figure(snapshot?.costMax, 2)} ms per stage frame.
        </p>
      </section>
    </>
  );
}
