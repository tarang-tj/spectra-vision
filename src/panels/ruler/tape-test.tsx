/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Derived } from "./derive";
import "./tape-test.css";

const COLUMNS = [
  "Span",
  "Reading and bar",
  "Tape",
  "Reading minus tape",
  "Result",
];

/** Every span with a tape reading typed beside it, set against that reading,
 * and how many of the tape values fall inside their bars. */
export default function TapeTest({ d }: { d: Derived }) {
  const { checks, tally } = d.tape;
  if (!checks.length) return null;
  return (
    <section className="ruler-block ruler-tape-test" aria-label="Tape test">
      <h3>Tape test</h3>
      {/* The roles are spelt out because the narrow layout (tape-test.css)
          turns each row into a card, which would otherwise drop them. */}
      <table className="ruler-table" role="table">
        <caption className="ruler-basis">
          Each reading and its bar against what the tape read. A check, not a
          correction.
        </caption>
        <thead role="rowgroup">
          <tr role="row">
            {COLUMNS.map((name) => (
              <th key={name} scope="col" role="columnheader">
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {checks.map((c) => (
            <tr key={c.index} role="row" data-testid="ruler-tape-row">
              <th scope="row" role="rowheader" data-label={COLUMNS[0]}>
                {c.index + 1}
              </th>
              {[c.reading, c.tape, c.difference, c.verdict].map((text, i) => (
                <td key={i} role="cell" data-label={COLUMNS[i + 1]}>
                  {text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="ruler-basis" role="status" data-testid="ruler-tape-tally">
        {tally
          ? `${tally}.`
          : "No tape value to count yet: a span used as a known span is not a check."}
      </p>
    </section>
  );
}
