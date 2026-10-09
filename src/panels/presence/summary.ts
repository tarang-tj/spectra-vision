/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The summary of a session and its two exports. Pure: no DOM and no clock, so
// the files can be checked in unit tests. A figure that was not measured is null
// in JSON and "not seen" in Markdown. Nothing here scores or judges a person.
import { formatMeasured } from "../../measure/format";
import type { BenchReport } from "../lab/benchmark-report";
import type { Baseline } from "./calibration";
import { denominatorText } from "./row";
import type { MetricRow } from "./row";
import type { EndReason, ModelUse } from "./presence-store";
import type { Thresholds } from "./types";

export type PresenceSummary = {
  app: "SPECTRA";
  kind: "presence";
  schema: 1;
  startedAt: string;
  endReason: EndReason | null;
  protocol: {
    calibrationMs: number;
    /** True when a test flag shortened the standard 5 s calibration. */
    shortened: boolean;
    pauses: number;
    notes: string;
  };
  thresholds: Thresholds;
  baseline: Baseline | null;
  models: ModelUse[];
  device: BenchReport["device"];
  metrics: {
    id: string;
    label: string;
    /** False when the inputs were not seen; the numbers are then null. */
    seen: boolean;
    value: number | null;
    error: number | null;
    unit: string | null;
    range: [number, number] | null;
    basis: string | null;
    reason: string | null;
    /** Shares: seconds the thing was seen and seconds the task ran; the share is of the first. */
    seenSeconds: number | null;
    coveredSeconds: number | null;
    /** Raw count and time beside a rate, for example "1 start in 3.0 s". */
    detail: string | null;
  }[];
};

const num = (value: number) => (Number.isFinite(value) ? value : null);
const NOTES =
  "Measured in this browser from pose, hand and face model results. Nothing was uploaded. Head direction is where the head points, not where the eyes look. Expression change is how much the face moves, not what it means.";

type Input = {
  startedAt: string;
  endReason: EndReason | null;
  calibrationMs: number;
  shortened: boolean;
  pauses: number;
  thresholds: Thresholds;
  baseline: Baseline | null;
  models: ModelUse[];
  rows: MetricRow[];
  device: BenchReport["device"];
};

export function buildSummary(input: Input): PresenceSummary {
  return {
    app: "SPECTRA",
    kind: "presence",
    schema: 1,
    startedAt: input.startedAt,
    endReason: input.endReason,
    protocol: {
      calibrationMs: input.calibrationMs,
      shortened: input.shortened,
      pauses: input.pauses,
      notes: NOTES,
    },
    thresholds: input.thresholds,
    baseline: input.baseline,
    models: input.models,
    device: input.device,
    metrics: input.rows.map((row) => ({
      id: row.id,
      label: row.label,
      seen: !!row.measured,
      value: row.measured ? num(row.measured.value) : null,
      error: row.measured ? num(row.measured.error) : null,
      unit: row.measured?.unit ?? null,
      range: row.range ? [row.range[0], row.range[1]] : null,
      basis: row.measured?.basis ?? null,
      reason: row.reason ?? null,
      seenSeconds: row.denominator ? num(row.denominator.seenMs / 1000) : null,
      coveredSeconds: row.denominator
        ? num(row.denominator.coveredMs / 1000)
        : null,
      detail: row.detail ?? null,
    })),
  };
}

/** JSON has no NaN: `num` already turned those into null. */
export const toJson = (summary: PresenceSummary) =>
  JSON.stringify(summary, null, 2);

const cell = (text: string) => text.replace(/\|/g, "/").replace(/\s+/g, " ");
const END: Record<EndReason, string> = {
  user: "stopped by the user",
  source: "ended because the source changed",
  mode: "ended because the mode changed",
  limit: "ended at the recording limit",
};

export function toMarkdown(
  summary: PresenceSummary,
  rows: MetricRow[],
): string {
  const { protocol, thresholds: th, device } = summary,
    seconds = rows.find((row) => row.id === "time")?.measured,
    lines = [
      "# SPECTRA presence measurement",
      "",
      `- Started: ${summary.startedAt}${summary.endReason ? `, ${END[summary.endReason]}` : ""}`,
      `- Time covered: ${seconds ? formatMeasured(seconds) : "not seen"}; stage stopped and resumed ${protocol.pauses} times (that time is left out)`,
      `- Calibration: ${protocol.calibrationMs / 1000} s${protocol.shortened ? ", SHORTENED TEST RUN, not the standard 5 s" : ""}`,
      `- Thresholds: head within ${th.headAngle}° of baseline; hand start at ${th.handSpeed} shoulder widths a second after ${th.handStill} ms under it; still means at or under ${th.stillMultiple} times the noise floor`,
      `- Models: ${summary.models.map((m) => `${m.task} ${m.model} on ${m.delegate}`).join("; ") || "none"}`,
      `- Device: ${device.userAgent} (${device.browser}, ${device.platform}, GPU ${device.gpu})`,
      "",
      "| Measure | Value | Basis |",
      "| --- | --- | --- |",
    ];
  for (const row of rows)
    lines.push(
      `| ${row.label} | ${row.measured ? `${formatMeasured(row.measured)}${row.denominator ? ` ${denominatorText(row.denominator)}` : ""}${row.detail ? ` (${row.detail})` : ""}${row.range ? ` (recomputed range ${row.range[0].toFixed(1)} to ${row.range[1].toFixed(1)})` : ""}` : `not seen (${cell(row.reason ?? "")})`} | ${row.measured ? cell(row.measured.basis) : ""} |`,
    );
  lines.push("", protocol.notes, "");
  return lines.join("\n");
}
