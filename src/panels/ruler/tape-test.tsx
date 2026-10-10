/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Derived } from "./derive";

/** Every span with a tape reading typed beside it, set against that reading,
 * and how many of the tape values fall inside their bars. */
export default function TapeTest({ d }: { d: Derived }) {
  const { checks, tally } = d.tape;
  if (!checks.length) return null;
  return (
    <section className="ruler-block" aria-label="Tape test">
      <h3>Tape test</h3>
      <table className="ruler-table">
        <caption className="ruler-basis">
          Each reading and its bar against what the tape read. A check, not a
          correction.
        </caption>
        <thead>
          <tr>
            <th scope="col">Span</th>
            <th scope="col">Reading and bar</th>
            <th scope="col">Tape</th>
            <th scope="col">Reading minus tape</th>
            <th scope="col">Result</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((c) => (
            <tr key={c.index} data-testid="ruler-tape-row">
              <th scope="row">{c.index + 1}</th>
              <td>{c.reading}</td>
              <td>{c.tape}</td>
              <td>{c.difference}</td>
              <td>{c.verdict}</td>
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
