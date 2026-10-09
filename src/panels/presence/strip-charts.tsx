/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef } from "react";
import { CHART, drawChart } from "../lab/charts";
import type { Guide } from "../lab/charts";
import { CHART_SPAN_MS } from "./live-series";
import type { ChartId } from "./live-series";
import { presenceStore } from "./presence-store";
import type { PresenceState } from "./presence-store";

type Spec = { id: ChartId; title: string; unit: string; note: string };
const SPECS: Spec[] = [
  {
    id: "head",
    title: "Head direction",
    unit: "°",
    note: "Angle from the baseline. Dashed line: the stated angle.",
  },
  {
    id: "hands",
    title: "Hand speed",
    unit: "sw/s",
    note: "Fastest hand, in shoulder widths a second. Dashed line: the movement threshold.",
  },
  {
    id: "sway",
    title: "Sway",
    unit: "sw",
    note: "Sideways offset of the shoulder midpoint from where it was in calibration. Dashed line: the calibration noise.",
  },
  {
    id: "still",
    title: "Body motion",
    unit: "sw/s",
    note: "Mean speed of shoulders, elbows, wrists and hips. Dashed line: the still limit.",
  },
  {
    id: "expression",
    title: "Expression change",
    unit: "/s",
    note: "Change per second of smile, brow raise and jaw open. Dashed line: the calibration noise.",
  },
];

function guideFor(id: ChartId, state: PresenceState): Guide[] {
  const { baseline: b, thresholds: th } = state;
  const value =
    id === "head"
      ? th.headAngle
      : id === "hands"
        ? th.handSpeed
        : id === "sway"
          ? b?.pose?.swayNoise
          : id === "still"
            ? b?.pose && th.stillMultiple * b.pose.motionMean
            : b?.face?.changeNoise;
  return [{ value: value ?? NaN, color: CHART.second }];
}

/** One canvas strip chart per metric, redrawn when the store publishes (a few
 * times a second while measuring). Every point is one model result. */
export default function StripCharts(props: { state: PresenceState }) {
  const { state } = props,
    canvases = useRef(new Map<ChartId, HTMLCanvasElement | null>());
  useEffect(() => {
    const { series, now } = presenceStore.charts();
    for (const spec of SPECS)
      drawChart(canvases.current.get(spec.id) ?? null, {
        series: [
          {
            samples: series[spec.id].samples(CHART_SPAN_MS, now),
            color: CHART.line,
          },
        ],
        guides: guideFor(spec.id, state),
        now,
        spanMs: CHART_SPAN_MS,
        unit: spec.unit,
      });
  });
  return (
    <>
      {SPECS.map((spec) => (
        <section className="lab-block" key={spec.id}>
          <header>
            <h3>{spec.title}</h3>
          </header>
          <canvas
            ref={(el) => void canvases.current.set(spec.id, el)}
            role="img"
            aria-label={`${spec.title} over the last ${CHART_SPAN_MS / 1000} seconds`}
          />
          <p className="lab-note">{spec.note}</p>
        </section>
      ))}
    </>
  );
}
