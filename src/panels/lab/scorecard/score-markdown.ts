/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The scorecard's two exports. The Markdown carries the table, the caption
// and every basis line word for word as the page shows them; the JSON holds
// null for a figure that is not stated.
import type { Figure } from "./bootstrap";
import type { ReportRun, ScoreReport } from "./score-report";
import {
  NOT_MEASURED,
  apCell,
  basisLines,
  caption,
  comparison,
  didNotRun,
  otherClasses,
  shareCell,
  shortenedNote,
  speedCell,
  tooFew,
  type SetFacts,
  type Shortened,
} from "./score-wording";

export const factsOf = (report: ScoreReport): SetFacts => ({
  pictures: report.set.pictures,
  boxes: report.set.boxes,
  bytes: report.set.bytes,
  checked: report.set.checked,
});
export const shortOf = (report: ScoreReport): Shortened =>
  report.protocol.shortened
    ? { scored: report.protocol.picturesScored, of: report.set.pictures }
    : null;

/** The five cells of a run's row, as the page and the Markdown both show them. */
export function cellsOf(run: ReportRun, report: ScoreReport): string[] {
  if (run.status !== "ok") return Array<string>(5).fill(NOT_MEASURED);
  const few = tooFew(report.protocol.labelledObjects),
    cell = (figure: Figure | null, show: (figure: Figure) => string) =>
      figure ? show(figure) : few;
  return [
    cell(run.found, (f) => shareCell(f, "objects", NOT_MEASURED)),
    cell(run.right, (f) => shareCell(f, "boxes", "no box kept")),
    cell(run.ap50, apCell),
    cell(run.ap, apCell),
    run.latency ? speedCell(run.latency.p50, run.latency.p95) : NOT_MEASURED,
  ];
}
export const captionOf = (report: ScoreReport) =>
  caption(report.protocol.picturesScored, report.protocol.labelledObjects) +
  shortenedNote(shortOf(report));
export const basisOf = (report: ScoreReport) =>
  basisLines(
    factsOf(report),
    report.protocol.confidence,
    report.protocol.classes,
  );
export const comparisonsOf = (report: ScoreReport) =>
  report.comparisons.map((c) => comparison(c.run, c.against, c.found, c.ap50));

export const toJson = (report: ScoreReport) => JSON.stringify(report, null, 2);

export function toMarkdown(report: ScoreReport): string {
  const lines = [
    "# SPECTRA scorecard",
    "",
    `Started ${report.startedAt}. Set ${report.set.id} (${report.set.source}).`,
    "",
    "| Run | Found | Right | AP50 | AP50:95 | ms a picture |",
    "|---|---|---|---|---|---|",
    ...report.runs.map(
      (run) =>
        `| ${run.label} on ${run.delegate}${
          run.status === "ok" ? "" : `, ${didNotRun(run.note)}`
        } | ${cellsOf(run, report).join(" | ")} |`,
    ),
    "",
    captionOf(report),
    "",
    ...basisOf(report).map((line) => `- ${line}`),
  ];
  const compared = comparisonsOf(report);
  if (compared.length)
    lines.push("", "## Compared on the same pictures", "", ...compared);
  if (report.byClass.length)
    lines.push(
      "",
      "## By class",
      "",
      `| Class | Labelled | ${report.runs.map((run) => `${run.label} on ${run.delegate}`).join(" | ")} |`,
      `|---|---|${report.runs.map(() => "---|").join("")}`,
      ...report.byClass.map(
        (row) =>
          `| ${row.label} | ${row.labelled} | ${row.found
            .map((figure) =>
              figure
                ? shareCell(figure, "objects", NOT_MEASURED)
                : NOT_MEASURED,
            )
            .join(" | ")} |`,
      ),
    );
  lines.push("", otherClasses(report.otherClasses), "");
  return lines.join("\n");
}
