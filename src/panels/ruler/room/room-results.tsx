/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import BasisDetails from "../basis-details";
import { isUncertainText, readingText } from "../reading";
import type { Unit } from "../units";
import type { Quantity } from "./room-merge";
import type { RoomSolution } from "./room-solve";
import { areaOf, lengthOf, picturesText, roomBasis } from "./text";
import { ROOM_TRIALS } from "./view-frame";

function Row({
  label,
  id,
  q,
  area,
  unit,
  basis,
  rests,
}: {
  label: string;
  id: string;
  q: Quantity | null;
  area?: boolean;
  unit: Unit;
  basis: string;
  rests: string;
}) {
  const text = q
      ? readingText(area ? areaOf(q, unit, basis) : lengthOf(q, unit, basis))
      : "not measured: too few of the simulated retakes could place its corners",
    key = area ? "mm2" : "mm";
  return (
    <li>
      <span className="ruler-label">{label}</span>
      <output
        className="ruler-value"
        data-testid={id}
        data-uncertain={isUncertainText(text) || undefined}
        {...(q
          ? { [`data-${key}`]: q.value, [`data-error-${key}`]: q.error }
          : {})}
      >
        {text}
      </output>
      <span className="ruler-label">Rests on {rests}.</span>
    </li>
  );
}

/** The room's numbers, each as value ± error with the pictures it rests on,
 * or the plain reason there are none. */
export default function RoomResults({
  solution,
  order,
  unit,
  closed,
}: {
  solution: RoomSolution;
  /** View ids in strip order, for naming pictures. */
  order: number[];
  unit: Unit;
  closed: boolean;
}) {
  const n = solution.numbers;
  if (!n)
    return solution.missing.length ? (
      <p className="ruler-warn" data-testid="room-missing">
        No numbers yet: {solution.missing.length} corner
        {solution.missing.length === 1 ? "" : "s"} of the outline{" "}
        {solution.missing.length === 1 ? "is" : "are"} marked only in pictures
        that are not on the plan. A picture joins the plan when two points
        marked in it, at different places on the floor, are also marked in
        pictures already on the plan and agree.
      </p>
    ) : null;
  const all = roomBasis(solution.outlineViews, order),
    whole = picturesText(solution.outlineViews, order);
  return (
    <>
      <ol className="ruler-results" data-testid="room-numbers">
        {closed && (
          <Row
            label="Floor area"
            id="room-area"
            q={n.area}
            area
            unit={unit}
            basis={all}
            rests={whole}
          />
        )}
        {n.selfIntersecting && (
          <li>
            <p className="ruler-warn">
              The outline crosses itself, so it has no single area. Put the
              corners in order round the room: take one out of the outline and
              add it again at the end.
            </p>
          </li>
        )}
        <Row
          label={closed ? "Perimeter" : "Length so far"}
          id="room-perimeter"
          q={n.length}
          unit={unit}
          basis={all}
          rests={whole}
        />
        {n.walls.map((w, i) => (
          <Row
            key={i}
            label={`Wall ${i + 1}`}
            id="room-wall"
            q={w}
            unit={unit}
            basis={roomBasis(solution.wallViews[i], order)}
            rests={picturesText(solution.wallViews[i], order)}
          />
        ))}
      </ol>
      <BasisDetails
        lead={`Each bar is 2 standard deviations over ${ROOM_TRIALS} simulated retakes of the taps in every picture the number rests on. It leaves things out.`}
      >
        <p className="ruler-basis" data-testid="room-basis">
          {all}
        </p>
        <p className="ruler-basis">
          Heights are not on this plan: a height needs the camera of the picture
          it was tapped in, so each stays with its own picture under Walls.
        </p>
      </BasisDetails>
    </>
  );
}
