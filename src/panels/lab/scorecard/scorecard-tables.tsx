/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { basisOf, captionOf, cellsOf, comparisonsOf } from "./score-markdown";
import type { ScoreReport } from "./score-types";
import * as words from "./score-wording";

/** The results table with its caption and basis lines, the paired
 * comparisons and the by-class rows of one report. */
export default function ScorecardTables({ report }: { report: ScoreReport }) {
  return (
    <>
      <table className="lab-table" data-testid="score-results">
        <thead>
          <tr>
            {["Run", "Found", "Right", "AP50", "AP50:95", "ms a picture"].map(
              (name) => (
                <th scope="col" key={name}>
                  {name}
                </th>
              ),
            )}
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
                        ? words.shareCell(figure, "objects", words.NOT_MEASURED)
                        : words.NOT_MEASURED}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="lab-note">{words.otherClasses(report.otherClasses)}</p>
      </details>
    </>
  );
}
