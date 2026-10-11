/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect } from "react";
import { derive } from "../derive";
import { useRuler } from "../state";
import { currentRoom, stageView } from "./current";
import { dropGrab } from "./pointer";
import RoomPlanPanel from "./room-plan-panel";
import RoomPoints from "./room-points";
import RoomResults from "./room-results";
import { pointName } from "./room-solve";
import { closeOutline, setNext, useRoom, type RoomState } from "./store";
import { useViews, viewName, type View } from "./views-store";

/** The one instruction for the Room tool, from where things stand. */
export function roomStep(
  room: RoomState,
  pictures: number,
  here: View | null,
  ready: boolean,
  /** False when the picture on the stage is not on the plan. */
  onPlan = true,
): string {
  if (!pictures)
    return "Add a picture of the room first, under Pictures of this room.";
  if (!here)
    return "The stage shows a picture that is not one of the room's. Choose one of the room's pictures, or press Keep this picture.";
  if (!ready)
    return "Tap the four corners of the reference in this picture first.";
  if (room.note && "held" in room.note)
    return `That tap took hold of ${pointName(room.note.held)} and moved nothing. Drag it to adjust it, or tap a little further away to place a point.`;
  if (room.note)
    return `Nothing was undone: the last room change was tapped on ${viewName(room.note.undoOn)}, which is not on the stage. Show that picture, then press Undo.`;
  if (room.next.kind === "link")
    return `Tap ${pointName(room.next.point)} in this picture: the same spot on the floor.`;
  if (room.next.kind === "mark")
    return "Tap a spot on the floor that you can find again in another picture.";
  // Said before any tap: a corner marked here would end in "No numbers yet".
  if (!onPlan)
    return "This picture is not on the plan yet, so corners marked here will not count until it is. First mark two points here that are also marked in a picture on the plan: press Mark in this picture beside each, below, and tap the same spot.";
  const n = room.outline.length;
  return n < 3
    ? `${n} corner${n === 1 ? "" : "s"} in the outline. Tap a floor corner of the room. Go in order round the room; switch pictures for the corners this one does not show.`
    : `${n} corners in the outline. Tap the next one, switch pictures for more, or press Close outline.`;
}

/** The Room part of the Ruler panel: which pictures are on the plan and why
 * the others are not, the room points, and the outline's numbers. The numbers
 * rest on the stored pictures, not on what the stage shows, so they stay
 * while the stage changes. */
export default function RoomSection() {
  const s = useRuler(),
    room = useRoom(),
    { views } = useViews();
  useEffect(() => dropGrab, []);
  if (s.tool !== "room" && !room.points.length) return null;
  const here = stageView(s.generation),
    { solution } = currentRoom(views, room),
    order = views.map((v) => v.id);
  return (
    <section className="ruler-block" aria-label="Room">
      <h3>Room</h3>
      <p className="ruler-note">
        One outline from corners in different pictures. A picture after the
        first joins the plan only when two points, at different places on the
        floor, are marked both in it and in pictures already on the plan, and
        both agree on which way round the sheet lies. With one shared point the
        picture is listed and gives the plan nothing: no point, no line, no
        number. On the picture each room point is labelled R and its number.
      </p>
      <p className="ruler-warn" data-testid="room-shared-warning">
        Choose shared points that cannot be mistaken: a door edge, a mark on the
        floor. Opposite corners of a room can look alike, and the wrong one fits
        the sheet turned half way round. Two shared points catch one mistaken
        mark in the picture being placed. Not caught: two mistaken marks that
        mislead the same way, whether both are in this picture or one is here
        and the other is an earlier picture's mark of a point that only these
        two pictures share, which nothing else checks. A picture saved flipped
        left to right (a mirror image) is not placed: it is refused, or held
        until a shared point well off the lines through the middle of the sheet
        rules the mirror image out.
      </p>
      {s.tool === "room" && (
        <p className="ruler-step" role="status" data-testid="room-step">
          {roomStep(
            room,
            views.length,
            here,
            !!derive(s).sheet,
            !here || !!solution.views.find((v) => v.id === here.id)?.rigid,
          )}
        </p>
      )}
      <ul className="room-places" data-testid="room-places">
        {solution.views.map((v) => (
          <li
            key={v.id}
            data-state={v.state}
            className={
              v.state === "refused" || v.state === "provisional"
                ? "ruler-warn"
                : "ruler-basis"
            }
          >
            {v.text}
          </li>
        ))}
      </ul>
      <div className="ruler-group" role="group" aria-label="Next tap adds">
        <button
          className="button"
          aria-pressed={room.next.kind === "corner"}
          disabled={room.closed}
          onClick={() => setNext({ kind: "corner" })}
        >
          Outline corner
        </button>
        <button
          className="button"
          aria-pressed={room.next.kind === "mark"}
          onClick={() => setNext({ kind: "mark" })}
        >
          Floor mark
        </button>
        <button
          className="button"
          onClick={() => closeOutline(!room.closed)}
          disabled={!room.closed && room.outline.length < 3}
        >
          {room.closed ? "Reopen outline" : "Close outline"}
        </button>
      </div>
      <RoomPoints room={room} views={views} here={here} solution={solution} />
      <RoomResults
        solution={solution}
        order={order}
        unit={s.unit}
        closed={room.closed}
      />
      <RoomPlanPanel
        views={views}
        room={room}
        solution={solution}
        unit={s.unit}
      />
    </section>
  );
}
