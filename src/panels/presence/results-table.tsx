/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { formatMeasured } from "../../measure/format";
import { denominatorText } from "./row";
import type { MetricRow } from "./row";

/** Every metric as value ± error, or "not seen" with the reason. The basis of
 * each error is one tap away and is also in the export. */
export default function ResultsTable(props: { rows: MetricRow[] }) {
  return (
    <table className="lab-table presence-table" data-testid="presence-results">
      <thead>
        <tr>
          <th scope="col">Measure</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.id} data-testid={`presence-row-${row.id}`}>
            <th scope="row">
              {row.label}
              <details>
                <summary>
                  {row.measured ? "How the error is found" : "Why"}
                </summary>
                <p>{row.measured ? row.measured.basis : row.reason}</p>
              </details>
            </th>
            <td className={row.measured ? "value" : "value not-seen"}>
              {row.measured ? formatMeasured(row.measured) : "not seen"}
              {row.measured && row.denominator && (
                <small>{denominatorText(row.denominator)}</small>
              )}
              {row.measured && row.detail && <small>{row.detail}</small>}
              {row.measured && row.range && (
                <small>
                  recomputed range {row.range[0].toFixed(1)} to{" "}
                  {row.range[1].toFixed(1)} {row.measured.unit}
                </small>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
