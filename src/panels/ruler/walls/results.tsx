/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { formatMeasured } from "../../../measure/format";
import type { Unit } from "../units";
import type { Current } from "./current";
import type { Numbers, Q } from "./numbers";
import { areaOf, lengthOf, lengthText, volumeOf } from "./text";

/** Numbers behind an output, so tests and exports can read them. */
const attrs = (q: Q | null, key: string) =>
  q ? { [`data-${key}`]: q.value, [`data-error-${key}`]: q.error } : {};

function Row({
  label,
  id,
  text,
  data,
}: {
  label: string;
  id: string;
  text: string;
  data: object;
}) {
  return (
    <li>
      <span className="ruler-label">{label}</span>
      <output className="ruler-value" data-testid={id} {...data}>
        {text}
      </output>
    </li>
  );
}

/** The Walls numbers, each as value ± error, or "not measured" and why. */
export default function WallsResults({
  n,
  cur,
  unit,
  why,
  listId,
}: {
  n: Numbers;
  cur: Current;
  unit: Unit;
  /** Why there is no height, or null when there is one. */
  why: string | null;
  listId: string;
}) {
  const none = why ?? "not measured",
    closed = n.shell.closed,
    { basis } = cur;
  return (
    <>
      <ol className="ruler-results">
        <Row
          label="Floor area"
          id="walls-area"
          text={
            n.floorArea
              ? formatMeasured(areaOf(n.floorArea, unit, basis))
              : closed
                ? "not measured: the outline crosses itself, so it has no single area"
                : "not measured: close the room first"
          }
          data={attrs(n.floorArea, "mm2")}
        />
        <Row
          label="Ceiling height (mean of the measured corners)"
          id="walls-height"
          text={
            n.meanHeight
              ? formatMeasured(lengthOf(n.meanHeight, unit, basis))
              : none
          }
          data={attrs(n.meanHeight, "mm")}
        />
        <Row
          label="Wall area (openings not taken out)"
          id="walls-wall-area"
          text={
            n.wallArea ? formatMeasured(areaOf(n.wallArea, unit, basis)) : none
          }
          data={attrs(n.wallArea, "mm2")}
        />
        <Row
          label="Volume (floor area times mean height)"
          id="walls-volume"
          text={
            n.volume ? formatMeasured(volumeOf(n.volume, unit, basis)) : none
          }
          data={attrs(n.volume, "mm3")}
        />
      </ol>
      <ol className="ruler-legs" id={listId} aria-label="Walls">
        {n.walls.map((q, i) => {
          const own = n.shell.heights[i] !== null && n.heights[i];
          return (
            <li key={i} data-testid="walls-wall">
              Wall {i + 1}, corner {i + 1} to {((i + 1) % n.walls.length) + 1}:{" "}
              <output {...attrs(q, "mm")}>{lengthText(q, unit, basis)}</output>.
              Height at corner {i + 1}:{" "}
              <output {...attrs(own || null, "mm")}>
                {own
                  ? `${lengthText(own, unit, basis)} (measured)`
                  : n.meanHeight
                    ? `${lengthText(n.meanHeight, unit, basis)} (assumed: the mean of the measured corners)`
                    : "not measured"}
              </output>
            </li>
          );
        })}
      </ol>
      {cur.offCorners.map((i) => (
        <p key={i} className="ruler-warn" data-testid="walls-off">
          The ceiling point of corner {i + 1} is not above that corner: it sits
          well off the plumb line through it. Its height, and every number built
          on heights, is off until you drag it onto the wall edge.
        </p>
      ))}
      {n.kept < 1 && (
        <p className="ruler-warn">
          Only {Math.floor(n.kept * 100)}% of the simulated retakes could be
          used for at least one number here. Its bar is a lower bound, so do not
          read it as precise.
        </p>
      )}
    </>
  );
}
