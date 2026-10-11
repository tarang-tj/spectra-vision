/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Reading a room file. Text in, a checked room out or one plain sentence
// saying why not. Only JSON is parsed; every field is checked and copied by
// name, so nothing the file adds is carried in. Pure: no DOM.
import { isUnit } from "../units";
import {
  MAX_FILE_BYTES,
  ROOM_FILE_APP,
  ROOM_FILE_VERSION,
  type RoomFile,
  type SavedNumber,
} from "./room-file";
import {
  Bad,
  bool,
  fail,
  list,
  MAX,
  num,
  obj,
  pt,
  refuse,
  savedView,
  text,
  type Obj,
} from "./room-file-check";

export type Parsed =
  | { ok: true; file: RoomFile }
  | { ok: false; problem: string };

/** Check a room file's text. */
export function parseRoomFile(source: string): Parsed {
  if (source.length > MAX_FILE_BYTES)
    return {
      ok: false,
      problem:
        "This file is larger than 60 MB, which is more than a room file holds. It was not opened.",
    };
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return {
      ok: false,
      problem: "This is not a room file: it could not be read as JSON.",
    };
  }
  if (!raw || typeof raw !== "object" || (raw as Obj).app !== ROOM_FILE_APP)
    return {
      ok: false,
      problem: "This is not a room file saved by SPECTRA's Save room.",
    };
  const o = raw as Obj;
  if (o.version !== ROOM_FILE_VERSION)
    return {
      ok: false,
      problem: `This room file is version ${typeof o.version === "number" ? o.version : "unknown"}. This SPECTRA reads version ${ROOM_FILE_VERSION} only, so it was not opened.`,
    };
  try {
    const views = list(o.views, "its pictures", MAX.views).map((v, i) =>
        savedView(v, i + 1),
      ),
      ids = new Set(views.map((v) => v.id)),
      unique =
        ids.size === views.length || refuse("two pictures share a number"),
      points = list(o.points, "its room points").map((p) => {
        const q = obj(p, "a room point");
        return {
          id: num(q.id, "a room point"),
          obs: list(q.obs, "a room point", MAX.views).map((ob) => {
            const m = obj(ob, "a room point"),
              at = num(m.view, "a room point");
            return {
              view: ids.has(at)
                ? at
                : refuse("a room point names a picture that is not there"),
              at: pt(m.at, "a room point"),
            };
          }),
        };
      }),
      known = new Set(points.map((p) => p.id)),
      outline = list(o.outline, "its outline").map((id) =>
        known.has(num(id, "its outline"))
          ? (id as number)
          : refuse("its outline names a point that is not there"),
      ),
      ref = o.reference === null ? null : obj(o.reference, "its reference");
    if (!unique || known.size !== points.length)
      refuse("two points share a number");
    if (points.some((p) => !p.obs.length)) refuse("a room point has no mark");
    return {
      ok: true,
      file: {
        app: ROOM_FILE_APP,
        version: ROOM_FILE_VERSION,
        saved: text(o.saved, "its date"),
        unit: isUnit(o.unit) ? o.unit : fail("its unit"),
        reference: ref && {
          label: text(ref.label, "its reference"),
          long: num(ref.long, "its reference"),
          short: num(ref.short, "its reference"),
        },
        views,
        points,
        outline,
        closed: bool(o.closed, "its outline") && outline.length >= 3,
        placements: [],
        numbers: list(o.numbers, "its numbers").map((n): SavedNumber => {
          const q = obj(n, "a number");
          return {
            name: text(q.name, "a number"),
            value: num(q.value, "a number"),
            error: num(q.error, "a number"),
            unit: text(q.unit, "a number", 12),
            pictures: [],
            text: "",
            basis: "",
          };
        }),
        note: "",
      },
    };
  } catch (e) {
    if (!(e instanceof Bad)) throw e;
    return {
      ok: false,
      problem: `This room file is damaged and was not opened: ${e.message}.`,
    };
  }
}
