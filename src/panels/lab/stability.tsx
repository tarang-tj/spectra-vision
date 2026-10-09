/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import { useStudio } from "../../studio-context";
import { useSmoothing } from "../../vision/settings";
import "../../styles/measure-settings.css";
import { CHART, drawChart } from "./charts";
import {
  JITTER_WINDOW_MS,
  MIN_SAMPLES,
  SWITCH_WINDOW_MS,
  type Jitter,
} from "./stability-core";
import { openStabilityStore } from "./stability-store";
import type { SourceSize, StabilitySnapshot } from "./stability-store";

const HISTORY_MS = 30_000;
const px = (j: Jitter | null | undefined) =>
  j && Number.isFinite(j.value) ? `${j.value.toFixed(2)} px` : "no data";
const NAMES: Record<string, string> = {
  pose: "Body",
  hand: "Hands",
  face: "Face",
  gesture: "Gesture hands",
};

function Figure(props: {
  label: string;
  value: string;
  id: string;
  /** The unrounded number, for readers that compare figures. */
  exact?: number;
}) {
  return (
    <div>
      <dt>{props.label}</dt>
      <dd data-testid={props.id} data-value={props.exact}>
        {props.value}
      </dd>
    </div>
  );
}

/** The stability meter: how much the running mode's landmarks and boxes
 * scatter on the current input, raw next to smoothed, and how often a tracked
 * object changes identity. Every figure is measured on the results this
 * browser just produced; nothing here is an estimate. It listens to the
 * result feed only while the Lab is open. */
export default function Stability() {
  const { mode, frame } = useStudio(),
    [smoothing] = useSmoothing(),
    [snapshot, setSnapshot] = useState<StabilitySnapshot | null>(null),
    canvas = useRef<HTMLCanvasElement>(null),
    source = useRef(frame.source);
  source.current = frame.source;
  const tracked = !!mode.tracked;
  useEffect(() => {
    setSnapshot(null);
    const size = (): SourceSize => {
      const e = source.current?.element;
      if (!e) return null;
      return e instanceof HTMLVideoElement
        ? { width: e.videoWidth, height: e.videoHeight }
        : { width: e.naturalWidth, height: e.naturalHeight };
    };
    const store = openStabilityStore({ tracked, size }, (next) => {
      const h = store.history(next.now);
      drawChart(canvas.current, {
        series: [
          { samples: h.raw, color: CHART.second },
          { samples: h.smooth, color: CHART.line },
        ],
        guides: [],
        now: next.now,
        spanMs: HISTORY_MS,
        unit: "px",
      });
      setSnapshot(next);
    });
    return () => store.close();
  }, [mode.id, tracked]);
  const kinds = snapshot?.kinds ?? [],
    secs = (ms: number) => Math.round(ms / 1000),
    id = snapshot?.identity;
  return (
    <section className="lab-stability" aria-labelledby="stability-title">
      <h3 id="stability-title">Stability</h3>
      <p className="lab-note">
        How far each point wanders over the last {secs(JITTER_WINDOW_MS)} s of
        results, in source pixels, averaged over the points that have at least{" "}
        {MIN_SAMPLES} results in that window. Raw is what the model returned.
        Smoothed is the same results after the filter that Smooth landmarks
        draws
        {smoothing ? " (on now)" : " (off now; the meter applies it anyway)"}.
        On a moving input the figure includes the motion itself, so it reads as
        jitter only on a still input.
      </p>
      {kinds.map(({ kind, raw, smooth }) => (
        <dl
          className="lab-stats"
          key={kind}
          aria-label={`${NAMES[kind]} spread`}
        >
          <Figure
            label={`${NAMES[kind]} raw`}
            value={px(raw)}
            exact={raw.value}
            id={`stability-raw-${kind}`}
          />
          <Figure
            label={`${NAMES[kind]} smoothed`}
            value={px(smooth)}
            exact={smooth.value}
            id={`stability-smooth-${kind}`}
          />
          <Figure
            label="Points"
            value={String(raw.points)}
            id={`stability-points-${kind}`}
          />
        </dl>
      ))}
      {snapshot && kinds.length === 0 && !tracked && (
        <p className="lab-note" data-testid="stability-none">
          This mode returns no landmarks to measure.
        </p>
      )}
      {!snapshot && (
        <p className="lab-note" data-testid="stability-waiting">
          No data yet. Figures appear once the model has produced results.
        </p>
      )}
      {tracked && snapshot && (
        <>
          <dl className="lab-stats" aria-label="Tracked object stability">
            <Figure
              label="Box centre spread"
              value={px(snapshot.boxes)}
              exact={snapshot.boxes?.value}
              id="stability-boxes"
            />
            <Figure
              label="Identity switches"
              value={
                id && id.observedMs > 0
                  ? `${id.switches} in ${secs(id.observedMs)} s`
                  : "no data"
              }
              id="stability-switches"
            />
            <Figure
              label="Per minute"
              value={
                id && Number.isFinite(id.perMinute)
                  ? id.perMinute.toFixed(1)
                  : "no data"
              }
              id="stability-switch-rate"
            />
          </dl>
          <p className="lab-note">
            A switch is an id that vanished followed within 2 s by a new id of
            the same class that appears within 12% of the image of where it was
            last seen. Counted over the last {secs(SWITCH_WINDOW_MS)} s; the
            rate shows after 10 s of tracking. A real exit and entry at the same
            spot also counts, so on a moving input it is an upper bound. Boxes
            are drawn as the model returns them, not smoothed.
          </p>
        </>
      )}
      <canvas
        ref={canvas}
        hidden={kinds.length === 0}
        role="img"
        aria-label="Spread over time, raw in blue and smoothed in mint"
      />
      <p className="lab-note" hidden={kinds.length === 0}>
        Blue is raw, mint is smoothed, for the first measured task. Figures hold
        their last value while the stage is paused.
      </p>
    </section>
  );
}
