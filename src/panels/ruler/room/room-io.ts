/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Saving the room to a file and opening one. The file is written to the
// downloads folder by the browser and read from a file the user picks;
// nothing is sent anywhere. What happened is kept as one note for the panel.
import { useSyncExternalStore } from "react";
import { downloadText } from "../../../download";
import type { Unit } from "../units";
import { currentRoom } from "./current";
import { thumbOf } from "./picture";
import {
  derivedNumbers,
  MAX_FILE_BYTES,
  numbersThatDiffer,
  roomFile,
} from "./room-file";
import { parseRoomFile } from "./room-file-parse";
import { getRoom, loadRoom } from "./store";
import { dropFrames } from "./view-frame";
import {
  getViews,
  loadViews,
  setThumb,
  showView,
  type Load,
  type View,
} from "./views-store";

export type IoNote = {
  kind: "saved" | "opened" | "refused";
  text: string;
  /** Saved numbers the taps no longer give, each in words. */
  differ: string[];
};
let note: IoNote | null = null;
const listeners = new Set<() => void>();
const say = (next: IoNote | null) => {
  note = next;
  listeners.forEach((l) => l());
};
export const useIoNote = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => note,
  );
export const clearIoNote = () => say(null);

const dataUrl = (blob: Blob) =>
  new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
/** A picture as the file may hold it: JPEG and PNG as they are, anything
 * else (WebP, HEIC the browser could decode) as a JPEG of the same pixels. */
async function savable(blob: Blob): Promise<Blob> {
  if (blob.type === "image/jpeg" || blob.type === "image/png") return blob;
  const bitmap = await createImageBitmap(blob),
    canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((done, fail) =>
    canvas.toBlob(
      (b) => (b ? done(b) : fail(new Error("no picture"))),
      "image/jpeg",
      0.92,
    ),
  );
}
function blobOf(url: string): Blob {
  const [head, body] = url.split(","),
    bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.slice(5, head.indexOf(";")) });
}
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Save the room. With `withPictures` each picture goes in as a data URL. */
export async function saveRoom(withPictures: boolean, unit: Unit) {
  const { views } = getViews(),
    room = getRoom();
  try {
    const pictures = new Map<number, string>();
    if (withPictures)
      for (const v of views)
        if (v.blob) pictures.set(v.id, await dataUrl(await savable(v.blob)));
    const saved = new Date().toISOString(),
      file = roomFile(
        views,
        room,
        currentRoom(views, room).solution,
        unit,
        pictures,
        saved,
      ),
      text = JSON.stringify(file, null, 1);
    if (text.length > MAX_FILE_BYTES)
      return say({
        kind: "refused",
        differ: [],
        text: "Not saved: with its pictures the file would be larger than 60 MB, which Open room refuses. Untick the box, or use fewer or smaller pictures.",
      });
    downloadText(
      `spectra-room-${saved.slice(0, 19).replace(/[:T]/g, "-")}.json`,
      text,
      "application/json",
    );
    say({
      kind: "saved",
      differ: [],
      text: `Saved to your downloads: ${count(views.length, "picture")}' taps, ${count(room.points.length, "room point")} and ${count(file.numbers.length, "number")} with their bars. ${pictures.size ? "The pictures are in the file." : "The pictures are not in the file."} Nothing was uploaded.`,
    });
  } catch {
    say({
      kind: "refused",
      differ: [],
      text: "The room could not be saved by this browser.",
    });
  }
}

/** Open a room file in place of the room on show. A file that is refused
 * changes nothing. */
export async function openRoom(file: File, load: Load) {
  const refuse = (text: string) => say({ kind: "refused", differ: [], text });
  if (file.size > MAX_FILE_BYTES)
    return refuse(
      "This file is larger than 60 MB, which is more than a room file holds. It was not opened.",
    );
  let source: string;
  try {
    source = await file.text();
  } catch {
    return refuse("This file could not be read.");
  }
  const parsed = parseRoomFile(source);
  if (!parsed.ok) return refuse(parsed.problem);
  const saved = parsed.file;
  let views: View[];
  try {
    views = saved.views.map(({ id, label, picture, ...snap }) => ({
      id,
      label,
      blob: picture ? blobOf(picture) : null,
      thumb: null,
      snap,
      generation: null,
    }));
  } catch {
    return refuse(
      "This room file is damaged and was not opened: a picture in it could not be read.",
    );
  }
  dropFrames();
  loadViews(views);
  loadRoom({
    points: saved.points,
    outline: saved.outline,
    closed: saved.closed,
  });
  for (const v of views)
    if (v.blob) void thumbOf(v.blob).then((t) => t && setThumb(v.id, t));
  // Every number again, from the taps, in the unit the file was saved in.
  const now = derivedNumbers(
      views,
      currentRoom(views, getRoom()).solution,
      saved.closed,
      saved.unit,
    ),
    differ = numbersThatDiffer(saved.numbers, now),
    without = views.filter((v) => !v.blob).length;
  say({
    kind: "opened",
    differ,
    text: `Opened ${file.name}: ${count(views.length, "picture")}, ${count(saved.points.length, "room point")}. ${
      differ.length
        ? `${count(differ.length, "number")} of ${saved.numbers.length} worked out again from the taps ${differ.length === 1 ? "differs" : "differ"} from the saved one:`
        : `All ${saved.numbers.length} numbers were worked out again from the taps and equal the saved ones.`
    }${
      without === views.length
        ? " The pictures are not in the file: the plan and the numbers are shown, the pictures cannot be."
        : without
          ? ` ${count(without, "picture")} of them ${without === 1 ? "is" : "are"} not in the file and cannot be shown.`
          : ""
    }`,
  });
  const first = views.find((v) => v.blob);
  if (first) await showView(first.id, load);
}
