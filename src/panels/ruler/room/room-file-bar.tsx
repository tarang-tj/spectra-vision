/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState } from "react";
import { useStudio } from "../../../studio-context";
import { useRuler } from "../state";
import { clearIoNote, openRoom, saveRoom, useIoNote } from "./room-io";
import { loadRoom } from "./store";
import { dropFrames } from "./view-frame";
import { resetViews, useViews } from "./views-store";

/** Save room, Open room and Start a new room, with what the last one did. */
export default function RoomFileBar() {
  const { loadPicture } = useStudio(),
    { unit } = useRuler(),
    room = useViews(),
    note = useIoNote(),
    [pictures, setPictures] = useState(false),
    [working, setWorking] = useState(false),
    busy = working || room.busy;
  const run = async (job: () => Promise<void>) => {
    setWorking(true);
    try {
      await job();
    } finally {
      setWorking(false);
    }
  };
  return (
    <>
      <div className="ruler-group" role="group" aria-label="Room file">
        <button
          className="button"
          disabled={busy || !room.views.length}
          onClick={() => void run(() => saveRoom(pictures, unit))}
        >
          Save room
        </button>
        <label className="room-check">
          <input
            type="checkbox"
            checked={pictures}
            onChange={(e) => setPictures(e.target.checked)}
          />
          <span>Include the pictures in the file</span>
        </label>
        <label className="button upload" aria-disabled={busy}>
          <span>Open room</span>
          <input
            aria-label="Open a room file"
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void run(() => openRoom(f, loadPicture));
              e.target.value = "";
            }}
          />
        </label>
        <button
          className="button"
          disabled={busy || !room.views.length}
          onClick={() => {
            resetViews();
            loadRoom(null);
            dropFrames();
            clearIoNote();
          }}
        >
          Start a new room
        </button>
      </div>
      <p className="ruler-note">
        Save room writes one file to your downloads: every tap, the room's
        points and its numbers with their bars. The pictures go in only if the
        box is ticked. Open room replaces the room on show. Nothing is uploaded.
      </p>
      {note && (
        <div role="status" data-testid="room-file-note" data-kind={note.kind}>
          <p className={note.kind === "refused" ? "ruler-warn" : "ruler-basis"}>
            {note.text}
          </p>
          {note.differ.length > 0 && (
            <ul className="ruler-legs">
              {note.differ.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
