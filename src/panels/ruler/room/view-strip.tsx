/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useStudio } from "../../../studio-context";
import { isEmpty, useRuler } from "../state";
import ConfirmButton from "./confirm-button";
import { blobOfSource, thumbOf } from "./picture";
import RoomFileBar from "./room-file-bar";
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
    canKeep =
      !!el &&
      !!source &&
      (!video || paused) &&
      !onStage &&
      !room.busy &&
      s.generation === source.generation;

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
        picture keeps its own taps. Pictures stay on this device.
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
                  aria-label={`Picture ${i + 1}, ${v.label}${here ? ", on the stage" : ""}`}
                  title={v.label}
                  disabled={room.busy || !v.blob}
                  onClick={() => !here && void showView(v.id, loadPicture)}
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
                  again={`Press again to remove picture ${i + 1} and its taps`}
                  name={`Remove picture ${i + 1}, with everything tapped on it. Asks once more first.`}
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
      {video && !paused && (
        <p className="ruler-note">
          A moving picture cannot be one of the room's pictures. Freeze it, then
          press Keep this frame as a picture.
        </p>
      )}
      <p className="ruler-note" role="status" data-testid="room-status">
        {room.busy
          ? "Opening the picture."
          : (room.problem ??
            (room.views.length
              ? `${room.views.length} picture${room.views.length === 1 ? "" : "s"} in this room.${onStage ? "" : " The stage shows a picture that is not one of them."}`
              : "No pictures in this room yet."))}
      </p>
      <RoomFileBar />
    </section>
  );
}
