/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";
import { useStudio } from "../../../studio-context";
import { derive } from "../derive";
import { isEmpty, useRuler } from "../state";
import ConfirmButton from "./confirm-button";
import { currentRoom } from "./current";
import { nextStep, stageSays } from "./guide";
import { blobOfSource, thumbOf } from "./picture";
import RoomFileBar from "./room-file-bar";
import { useRoom } from "./store";
import {
  addView,
  adoptView,
  removeView,
  setThumb,
  showView,
  takeSnap,
  useViews,
  viewOf,
} from "./views-store";
import "./room.css";

/** The pictures of the room: one thumbnail each, which one is on the stage,
 * Add picture and Remove. Switching keeps what was tapped on every picture. */
export default function ViewStrip() {
  const { frame, paused, loadPicture, notice } = useStudio(),
    room = useViews(),
    s = useRuler(),
    source = frame.source,
    el = source?.element ?? null,
    shown = viewOf(room.current),
    onStage = !!shown && !!source && shown.generation === source.generation,
    video = el instanceof HTMLVideoElement,
    // A moving picture cannot be a view; a frozen frame can be kept as one.
    // The demo picture is not a picture of anyone's room: it is never offered.
    canKeep =
      !!el &&
      !!source &&
      source.kind !== "demo" &&
      (!video || paused) &&
      !onStage &&
      !room.busy &&
      s.generation === source.generation;

  // Taps on a stage picture that is not in the room go when a room picture
  // takes the stage: a thumbnail then asks once more before it does.
  const strayTaps =
      !!source && !onStage && s.generation === source.generation && !isEmpty(s),
    [leaving, setLeaving] = useState<number | null>(null),
    roomState = useRoom(),
    { solution } = currentRoom(room.views, roomState),
    named = (states: string[]) =>
      solution.views.filter((v) => states.includes(v.state)).map((v) => v.name),
    next = nextStep({
      pictures: room.views.length,
      onStage,
      ready: !!derive(s).sheet,
      roomTool: s.tool === "room",
      off: named(["unanchored", "provisional", "refused"]),
      bare: named(["no-reference"]),
      corners: roomState.outline.length,
      closed: roomState.closed,
      measured: !!solution.numbers,
    }),
    /** Room points only this picture shows: they go with it. */
    onlyIn = (id: number) =>
      roomState.points.filter((p) => p.obs.every((o) => o.view === id)).length;

  const thumb = (id: number, blob: Blob) =>
    void thumbOf(blob).then((t) => t && setThumb(id, t));

  /** Keep the stage's picture, with what is tapped on it, as a view. */
  async function keep(): Promise<boolean> {
    if (!el || !source) return false;
    const blob = await blobOfSource(el);
    if (!blob) {
      notice("This picture could not be kept: the browser did not give it.");
      return false;
    }
    const id =
      el instanceof HTMLImageElement
        ? adoptView(blob, source.label, source.generation)
        : await addView(
            blob,
            `Frame from ${source.label}`,
            loadPicture,
            takeSnap(),
          );
    if (id === null) return false;
    thumb(id, blob);
    return true;
  }
  async function add(file: File) {
    if (!file.type.startsWith("image/")) {
      notice("Choose an image file. A room is built from still pictures.");
      return;
    }
    // A photo you uploaded, or any picture you tapped on, joins the room
    // first, so adding the next one does not lose it.
    if (canKeep && (source?.kind === "image" || !isEmpty(s)))
      if (!(await keep())) return;
    const id = await addView(file, file.name, loadPicture);
    if (id !== null) thumb(id, file);
  }

  return (
    <section className="ruler-block" aria-label="Pictures of this room">
      <h3>Pictures of this room</h3>
      <p className="ruler-note">
        One picture cannot see a whole room. Take several from different spots
        with the reference sheet left where it is, and add them here. Each
        picture keeps its own taps. The Room tool, under What to measure, joins
        them into one plan. Pictures stay on this device.
      </p>
      {room.views.length > 0 && (
        <ul className="room-strip" data-testid="room-strip">
          {room.views.map((v, i) => {
            const here = v.id === room.current && onStage;
            return (
              <li key={v.id} data-current={here || undefined}>
                <button
                  className="room-thumb"
                  aria-pressed={here}
                  aria-label={
                    leaving === v.id
                      ? `Press again to show picture ${i + 1} and lose the taps on the stage's picture`
                      : `Picture ${i + 1}, ${v.label}${here ? ", on the stage" : ""}`
                  }
                  title={v.label}
                  disabled={room.busy || !v.blob}
                  onBlur={() => setLeaving(null)}
                  onClick={() => {
                    if (here) return;
                    if (strayTaps && leaving !== v.id) return setLeaving(v.id);
                    setLeaving(null);
                    void showView(v.id, loadPicture);
                  }}
                >
                  {v.thumb ? (
                    <img src={v.thumb} alt="" />
                  ) : (
                    <span className="room-thumb-blank">
                      {v.blob ? "" : "no picture in the file"}
                    </span>
                  )}
                  <span className="room-thumb-name">
                    Picture {i + 1}
                    {here ? " (on the stage)" : ""}
                  </span>
                </button>
                <ConfirmButton
                  label="Remove"
                  again={`Press again to remove picture ${i + 1}, its taps${onlyIn(v.id) ? ` and the ${onlyIn(v.id)} room point${onlyIn(v.id) === 1 ? "" : "s"} only it shows` : ""}`}
                  name={`Remove picture ${i + 1}, with everything tapped on it and the room points only it shows. Asks once more first.`}
                  disabled={room.busy}
                  onConfirm={() => void removeView(v.id, loadPicture)}
                />
              </li>
            );
          })}
        </ul>
      )}
      <div className="ruler-group" role="group" aria-label="Room pictures">
        <label className="button upload" aria-disabled={room.busy}>
          <span>Add picture</span>
          <input
            aria-label="Add a picture of this room"
            type="file"
            accept="image/*"
            disabled={room.busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void add(f);
              e.target.value = "";
            }}
          />
        </label>
        {canKeep && (
          <button className="button" onClick={() => void keep()}>
            {video ? "Keep this frame as a picture" : "Keep this picture"}
          </button>
        )}
      </div>
      <p className="ruler-note" role="status" data-testid="room-status">
        {room.busy
          ? "Opening the picture."
          : (room.problem ??
            (room.views.length
              ? `${room.views.length} picture${room.views.length === 1 ? "" : "s"} in this room.`
              : "No pictures in this room yet."))}
        {!room.busy && !onStage && (
          <>
            {" "}
            <span data-testid="room-stage-says">
              {stageSays(source?.kind ?? null, paused)}
            </span>
          </>
        )}
        {leaving !== null &&
          " The picture on the stage has taps on it that are not part of the room. Pressing the thumbnail again shows the room's picture and loses them."}
      </p>
      <p className="ruler-step" data-testid="room-next">
        {next}
      </p>
      <RoomFileBar />
    </section>
  );
}
