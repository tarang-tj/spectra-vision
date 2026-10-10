/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The words and numbers the Depth mode shows: legend ends, inspector rows and
// the scale summary. A depth in metres is a Measured with its bar; without a
// metric fit the model's output is shown as what it is, a relative value.
import { formatMeasured } from "../../measure/format";
import type { Measured } from "../../measure/noise";
import type { DepthExtra, TaskResult } from "../../vision/types";
import type { InspectorRow } from "../types";
import type { Legend } from "./depth-map";
import { extremes } from "./depth-map";
import { floorSpan, measuredDepth } from "./depth-measured";
import type { DepthScale, MetricScale } from "./depth-metric";

/** The depth map of a "depth" result, or null when it is missing. */
export function depthExtra(result: TaskResult | undefined): DepthExtra | null {
  const extra = result?.kind === "depth" ? result.extra : undefined;
  return extra &&
    extra.values instanceof Float32Array &&
    typeof extra.width === "number" &&
    typeof extra.height === "number" &&
    extra.values.length === extra.width * extra.height
    ? (extra as DepthExtra)
    : null;
}

const WORKING = "working out the error";
const BEYOND = "not measured (too far past the marked floor for the fit)";
const shown = (m: Measured | "pending" | null) =>
  m === "pending" ? WORKING : m ? formatMeasured(m) : BEYOND;

/** The depth at a model output as text: metres with a bar, or why not. */
export const depthText = (scale: MetricScale, output: number) =>
  shown(measuredDepth(scale, output));

export function legendOf(extra: DepthExtra, scale: DepthScale): Legend {
  if (!scale.metric)
    return { near: "", far: "", note: "Relative depth. No lengths." };
  const near = measuredDepth(scale, extra.max),
    far = measuredDepth(scale, extra.min),
    brief = (m: Measured | "pending" | null) =>
      m === "pending" ? "..." : m ? formatMeasured(m) : "past the fit";
  return {
    near: brief(near),
    far: brief(far),
    note: "Metres, from the Ruler's floor fit.",
  };
}

export const DELEGATE_NAMES = {
  CPU: "CPU (WebAssembly)",
  GPU: "GPU (WebGPU)",
} as const;

/** Inspector rows: where the nearest and farthest values are and what they
 * read, then the measured facts of this run. */
export function depthRows(
  task: TaskResult,
  extra: DepthExtra,
  scale: DepthScale,
): InspectorRow[] {
  const { near, far } = extremes(extra),
    middle = { x: 0.5, y: 0.5 },
    value = (output: number) =>
      scale.metric
        ? depthText(scale, output)
        : `${output.toFixed(2)} (relative)`;
  return [
    {
      key: 1,
      label: "Nearest",
      detail: value(extra.max),
      point: near,
      color: "#fde725",
    },
    {
      key: 2,
      label: "Farthest",
      detail: value(extra.min),
      point: far,
      color: "#8f6fc0",
    },
    {
      key: 3,
      label: "Model input",
      detail: `${extra.width} x ${extra.height} px`,
      point: middle,
      color: "#67aaff",
    },
    {
      key: 4,
      label: "Latency",
      detail: `${task.latency.toFixed(0)} ms`,
      point: middle,
      color: "#67aaff",
    },
    {
      key: 5,
      label: "Running on",
      detail: DELEGATE_NAMES[task.delegate],
      point: middle,
      color: "#67aaff",
    },
    {
      key: 6,
      label: "Scale",
      detail: scale.metric ? "metric (floor fit)" : "relative",
      point: middle,
      color: "#67aaff",
    },
  ];
}

/** What the metric fit rests on, as sentences for the panel. */
export function metricSummary(scale: MetricScale): string[] {
  const span = floorSpan(scale),
    range =
      span === "pending"
        ? WORKING
        : span
          ? `${formatMeasured(span.near)} to ${formatMeasured(span.far)}`
          : "not measured (too few retakes of the Ruler's taps gave a fit)";
  return [
    `Metric depth, fitted to ${scale.floorCells.toLocaleString("en-US")} depth-map cells on the floor marked in the Ruler.`,
    `Marked floor, near to far from the camera: ${range}.`,
    `Scatter of the fit on that floor: ${(scale.fit.residual * 100).toFixed(1)}% of depth (root mean square).`,
  ];
}
