/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { modes, tasksOf } from "../../modes";
import type { ModeDef } from "../../modes";
import { taskStatus } from "../../telemetry/task-status";
import { useStudio } from "../../studio-context";
import { modelCard } from "./environment";
import { figure } from "./live-charts";

/** The slowest task decides when a mode is loaded or has its first result.
 * Null while any of its tasks has no measurement. */
function slowest(mode: ModeDef, field: "loadMs" | "firstResultMs") {
  let worst = 0;
  for (const spec of tasksOf(mode)) {
    const value = taskStatus(spec.kind, spec.model)?.[field];
    if (typeof value !== "number") return null;
    worst = Math.max(worst, value);
  }
  return worst;
}

/** Load time and time to first result for every mode loaded this session. */
export function LoadTimes() {
  useStudio();
  return (
    <section className="lab-block">
      <header>
        <h3>Load times</h3>
      </header>
      <table className="lab-table" data-testid="lab-loads">
        <thead>
          <tr>
            <th scope="col">Mode</th>
            <th scope="col">Model load</th>
            <th scope="col">First result</th>
          </tr>
        </thead>
        <tbody>
          {modes.map((mode) => {
            const load = slowest(mode, "loadMs"),
              first = slowest(mode, "firstResultMs");
            return (
              <tr key={mode.id}>
                <th scope="row">{mode.short}</th>
                <td>
                  {load === null ? "not loaded" : `${figure(load, 0)} ms`}
                </td>
                <td>
                  {first === null ? "no result" : `${figure(first, 0)} ms`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="lab-note">
        Latest load of each mode in this page session, timed from the moment its
        worker started. Model load includes fetching the runtime and the model;
        first result also includes waiting for a frame.
      </p>
    </section>
  );
}

/** Name, size, licence, source and hash of each model the current mode has
 * loaded, from the scripts/models.json data bundled at build time. */
export function ModelCards() {
  const { mode } = useStudio();
  return (
    <section className="lab-block">
      <header>
        <h3>Models in use</h3>
      </header>
      {tasksOf(mode).map((spec) => {
        const card = modelCard(spec.model);
        return (
          <dl
            className="lab-card"
            key={spec.kind}
            data-testid={`lab-model-${spec.kind}`}
          >
            <dt>Model</dt>
            <dd>{spec.model}</dd>
            {card ? (
              <>
                <dt>Size</dt>
                <dd>
                  {card.bytes === null
                    ? "not recorded"
                    : `${(card.bytes / 1e6).toFixed(2)} MB (${card.bytes.toLocaleString("en-US")} bytes)`}
                </dd>
                <dt>Licence</dt>
                <dd>
                  {card.license || "not recorded"}
                  {card.licenseNote && (
                    <small className="lab-licence-note">
                      {" "}
                      {card.licenseNote}
                    </small>
                  )}
                </dd>
                <dt>Source</dt>
                <dd>
                  {card.url ? (
                    <a href={card.url} rel="noreferrer noopener">
                      {card.url}
                    </a>
                  ) : (
                    "not recorded"
                  )}
                </dd>
                <dt>SHA-256</dt>
                <dd>
                  <code>{card.sha256 || "not recorded"}</code>
                </dd>
              </>
            ) : (
              <>
                <dt>Record</dt>
                <dd>Not listed in scripts/models.json.</dd>
              </>
            )}
          </dl>
        );
      })}
      <p className="lab-note">
        Recorded when the model was downloaded and checked at install time. The
        benchmark hashes the file again in this browser.
      </p>
    </section>
  );
}
