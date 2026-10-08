/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The shape of a benchmark report and its two exports. Pure: no DOM and no
// clock, so the exported files can be checked in unit tests. A figure that
// was not measured is null in JSON and "not measured" in Markdown.
import type { Delegate, TaskKind } from "../../vision/types";

export type BenchTask = {
  kind: TaskKind;
  model: string;
  /** SHA-256 of the model bytes this browser loaded, or null if not hashed. */
  sha256: string | null;
  /** True when that hash equals the one recorded in scripts/models.json. */
  sha256Matches: boolean | null;
  delegateRequested: Delegate;
  delegateActive: Delegate | null;
  /** Why the active delegate is not the requested one, else "". */
  delegateNote: string;
  loadMs: number | null;
  samples: number;
  p50: number | null;
  p95: number | null;
  max: number | null;
};
export type BenchRow = {
  mode: string;
  modeLabel: string;
  delegateRequested: Delegate;
  /** "ok", or why the run produced no usable figures. */
  status: "ok" | "failed" | "invalid";
  note: string;
  source: { kind: string; label: string; width: number; height: number } | null;
  /** The measuring period this row really covered. */
  measuredMs: number;
  /** Primary-task results per second over the measuring period. */
  processedFps: number | null;
  /** Stage frames drawn per second over the measuring period. */
  renderFps: number | null;
  droppedFrames: number | null;
  /** Tasks of the mode; the first is the primary one. */
  tasks: BenchTask[];
};
export type BenchReport = {
  app: "SPECTRA";
  kind: "benchmark";
  schema: 1;
  startedAt: string;
  protocol: {
    measureMs: number;
    warmupMs: number;
    /** True when a test flag shortened the standard 20 s protocol. */
    shortened: boolean;
    /** Inference is capped by the app, so processed FPS cannot exceed this. */
    inferenceCapFps: number;
    notes: string;
  };
  device: {
    userAgent: string;
    browser: string;
    platform: string;
    cores: number | null;
    memoryGb: number | null;
    gpu: string;
  };
  canvas: { width: number; height: number; dpr: number } | null;
  rows: BenchRow[];
};

const num = (value: number | null, digits = 1) =>
  value === null || !Number.isFinite(value)
    ? "not measured"
    : value.toFixed(digits);
/** JSON has no NaN: an unmeasured figure is stored as null. */
export const measured = (value: number): number | null =>
  Number.isFinite(value) ? value : null;
const cell = (text: string) => text.replace(/\|/g, "/").replace(/\s+/g, " ");

export function toJson(report: BenchReport): string {
  return JSON.stringify(report, null, 2);
}

/** A Markdown summary with one table line per task of each run. */
export function toMarkdown(report: BenchReport): string {
  const { protocol, device, canvas } = report,
    lines = [
      "# SPECTRA benchmark",
      "",
      `- Started: ${report.startedAt}`,
      `- Device: ${device.userAgent}`,
      `- Browser: ${device.browser}`,
      `- Platform: ${device.platform}, ${device.cores ?? "unknown"} logical cores, ${device.memoryGb === null ? "memory not reported" : `${device.memoryGb} GB reported`}`,
      `- GPU: ${device.gpu}`,
      `- Canvas: ${canvas ? `${canvas.width} x ${canvas.height} px (device pixel ratio ${canvas.dpr})` : "not measured"}`,
      `- Protocol: ${protocol.measureMs / 1000} s measured after ${protocol.warmupMs / 1000} s warm-up (excluded)${protocol.shortened ? ", SHORTENED TEST RUN, not the standard 20 s" : ""}. ${protocol.notes}`,
      "",
      "| Mode | Task | Model | SHA-256 | Requested | Active | Samples | p50 ms | p95 ms | max ms | Processed FPS | Render FPS | Dropped | Source | Note |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ];
  for (const row of report.rows) {
    const source = row.source
      ? `${row.source.label} ${row.source.width} x ${row.source.height}`
      : "not measured";
    if (!row.tasks.length)
      lines.push(
        `| ${row.modeLabel} | | | | ${row.delegateRequested} | | 0 | | | | | | | ${cell(source)} | ${cell(`${row.status}: ${row.note}`)} |`,
      );
    row.tasks.forEach((task, index) => {
      const primary = index === 0,
        note = [row.status === "ok" ? "" : `${row.status}: ${row.note}`]
          .concat(task.delegateNote)
          .filter(Boolean)
          .join(" ");
      lines.push(
        `| ${[
          row.modeLabel,
          task.kind,
          task.model,
          task.sha256
            ? `${task.sha256.slice(0, 12)}${task.sha256Matches ? " (matches record)" : " (DOES NOT match record)"}`
            : "not hashed",
          task.delegateRequested,
          task.delegateActive ?? "none",
          String(task.samples),
          num(task.p50),
          num(task.p95),
          num(task.max),
          primary ? num(row.processedFps) : "",
          primary ? num(row.renderFps) : "",
          primary ? num(row.droppedFrames, 0) : "",
          cell(source),
          cell(note),
        ].join(" | ")} |`,
      );
    });
  }
  lines.push(
    "",
    "Every figure was measured by a clock in this browser. Latency is the model call inside the worker. Percentiles use linear interpolation over all samples of the measuring period; nothing is smoothed.",
    "",
  );
  return lines.join("\n");
}
