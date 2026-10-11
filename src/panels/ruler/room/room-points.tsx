/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";
import { placedPoints } from "./picks";
import { pointName, type RoomSolution } from "./room-solve";
import {
  addPoint,
  removePoint,
  setCorner,
  setNext,
  unmark,
  type RoomState,
} from "./store";
import { picturesText } from "./text";
import type { View } from "./views-store";

/** Every room point: what it is, which pictures it is marked in, how far
 * apart they put it, and the buttons that mark it in this picture, move it
 * in or out of the outline, or remove it. Under it, the points the other
 * tools placed, to take one as a room point. */
export default function RoomPoints({
  room,
  views,
  here,
  solution,
}: {
  room: RoomState;
  views: readonly View[];
  /** The room picture on the stage, or null. */
  here: View | null;
  solution: RoomSolution;
}) {
  const order = views.map((v) => v.id),
    picks = placedPoints(views),
    [pick, setPick] = useState(""),
    chosen = picks.find((p) => p.key === pick) ?? picks[0];
  return (
    <>
      {room.points.length > 0 && (
        <ul className="ruler-results" data-testid="room-points">
          {room.points.map((p) => {
            const corner = room.outline.indexOf(p.id),
              placed = solution.points.find((x) => x.id === p.id),
              marked = !!here && p.obs.some((o) => o.view === here.id),
              linking = room.next.kind === "link" && room.next.point === p.id,
              name = pointName(p.id);
            return (
              <li key={p.id} data-testid="room-point">
                <span className="ruler-sub">
                  {name}:{" "}
                  {corner >= 0
                    ? `corner ${corner + 1} of the outline`
                    : "floor mark"}
                </span>
                <span className="ruler-label">
                  Marked in{" "}
                  {picturesText(
                    p.obs.map((o) => o.view),
                    order,
                  )}
                  .{" "}
                  {!placed?.sample
                    ? "Not on the plan: no picture on the plan shows it, or it is at the floor's horizon there."
                    : placed.apartMm !== null
                      ? `The pictures put it ${Math.round(placed.apartMm)} mm apart; the plan uses them together.`
                      : ""}
                </span>
                <div className="ruler-group" role="group" aria-label={name}>
                  {here && !marked && (
                    <button
                      className="button"
                      aria-pressed={linking}
                      aria-label={`Mark ${name} in this picture`}
                      onClick={() =>
                        setNext(
                          linking
                            ? { kind: room.closed ? "mark" : "corner" }
                            : { kind: "link", point: p.id },
                        )
                      }
                    >
                      Mark in this picture
                    </button>
                  )}
                  {here && marked && p.obs.length > 1 && (
                    <button
                      className="button"
                      aria-label={`Take the mark of ${name} off this picture`}
                      onClick={() => unmark(p.id, here.id)}
                    >
                      Unmark here
                    </button>
                  )}
                  <button
                    className="button"
                    aria-label={
                      corner >= 0
                        ? `Take ${name} out of the outline`
                        : `Add ${name} to the end of the outline`
                    }
                    onClick={() => setCorner(p.id, corner < 0)}
                  >
                    {corner >= 0 ? "Not a corner" : "Make it a corner"}
                  </button>
                  <button
                    className="button"
                    aria-label={`Remove ${name}`}
                    onClick={() => removePoint(p.id)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {chosen && (
        <div className="ruler-tape">
          <label>
            Or take a point already placed
            <select
              className="room-select"
              value={chosen.key}
              onChange={(e) => setPick(e.target.value)}
            >
              {picks.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button"
            disabled={room.closed}
            onClick={() => addPoint(chosen.view, { ...chosen.at }, true)}
          >
            Add as a corner
          </button>
          <button
            className="button"
            onClick={() => addPoint(chosen.view, { ...chosen.at }, false)}
          >
            Add as a floor mark
          </button>
        </div>
      )}
    </>
  );
}
