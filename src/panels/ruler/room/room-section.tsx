/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect } from "react";
import { derive } from "../derive";
import { useRuler } from "../state";
import { currentRoom, stageView } from "./current";
import { dropGrab } from "./pointer";
import RoomPoints from "./room-points";
import RoomResults from "./room-results";
import { pointName } from "./room-solve";
import { closeOutline, setNext, useRoom, type RoomState } from "./store";
import { useViews, type View } from "./views-store";

/** The one instruction for the Room tool, from where things stand. */
export function roomStep(
  room: RoomState,
  pictures: number,
  here: View | null,
  ready: boolean,
): string {
  if (!pictures)
    return "Add a picture of the room first, under Pictures of this room.";
  if (!here)
    return "The stage shows a picture that is not one of the room's. Choose one of the room's pictures, or press Keep this picture.";
  if (!ready)
    return "Tap the four corners of the reference in this picture first.";
  if (room.next.kind === "link")
    return `Tap ${pointName(room.next.point)} in this picture: the same spot on the floor.`;
  if (room.next.kind === "mark")
    return "Tap a spot on the floor that you can find again in another picture.";
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
        first joins the plan through a point marked both in it and in a picture
        already on the plan: the same spot on the floor, well away from the
        sheet. On the picture each room point is labelled R and its number.
      </p>
      {s.tool === "room" && (
        <p className="ruler-step" role="status" data-testid="room-step">
          {roomStep(room, views.length, here, !!derive(s).sheet)}
        </p>
      )}
      <ul className="room-places" data-testid="room-places">
        {solution.views.map((v) => (
          <li
            key={v.id}
            data-state={v.state}
            className={v.state === "refused" ? "ruler-warn" : "ruler-basis"}
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
    </section>
  );
}
