/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Reading a room file. Text in, a checked room out or one plain sentence
// saying why not. Only JSON is parsed; every field is checked and copied by
// name, so nothing the file adds is carried in. Pure: no DOM.
import type { Pt } from "../homography";
import { isUnit } from "../units";
import {
  MAX_FILE_BYTES,
  ROOM_FILE_APP,
  ROOM_FILE_VERSION,
  type RoomFile,
  type SavedNumber,
  type SavedView,
} from "./room-file";

export type Parsed =
  | { ok: true; file: RoomFile }
  | { ok: false; problem: string };

/** Largest counts a file may hold; more is a damaged or hostile file. */
const MAX = { views: 24, list: 5000, text: 400 };
class Bad extends Error {}
/** Refuse with a whole statement of what is wrong. */
const refuse = (statement: string): never => {
  throw new Bad(statement);
};
/** Refuse a part that is absent or of the wrong kind. */
const fail = (what: string): never =>
  refuse(`${what} is missing or not as it should be`);
type Obj = Record<string, unknown>;
const obj = (v: unknown, what: string): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : fail(what);
const list = (v: unknown, what: string, max = MAX.list): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail(what);
const num = (v: unknown, what: string): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fail(what);
const text = (v: unknown, what: string, max = MAX.text): string =>
  typeof v === "string" && v.length <= max ? v : fail(what);
const bool = (v: unknown, what: string): boolean =>
  typeof v === "boolean" ? v : fail(what);
const pt = (v: unknown, what: string): Pt => {
  const o = obj(v, what),
    p: Pt = { x: num(o.x, what), y: num(o.y, what) };
  if (o.s !== undefined) {
    const s = num(o.s, what);
    p.s = s > 0 ? s : fail(what);
  }
  return p;
};
const pts = (v: unknown, what: string, max = MAX.list): Pt[] =>
  list(v, what, max).map((p) => pt(p, what));

function view(v: unknown, n: number): SavedView {
  const what = `picture ${n}`,
    o = obj(v, what),
    r = obj(o.ruler, `${what}, the reference and shapes`),
    k = obj(o.known, `${what}, the known sizes`),
    b = obj(o.box, `${what}, the box`),
    w = obj(o.walls, `${what}, the walls`),
    source = r.source === null ? null : obj(r.source, `${what}, its size`),
    corners = list(w.corners, `${what}, the walls`).map((c) => {
      const q = obj(c, `${what}, a wall corner`);
      return {
        base: pt(q.base, `${what}, a wall corner`),
        top: q.top === null ? null : pt(q.top, `${what}, a ceiling point`),
      };
    }),
    pick = w.pick === null ? null : num(w.pick, `${what}, the walls`),
    out: SavedView = {
      id: num(o.id, what),
      label: text(o.label, `${what}, its name`),
      ruler: {
        refId: text(r.refId, `${what}, the reference`),
        customA: text(r.customA, `${what}, the reference`),
        customB: text(r.customB, `${what}, the reference`),
        corners: pts(r.corners, `${what}, the reference corners`, 4),
        swap: bool(r.swap, `${what}, the reference`),
        measures: list(r.measures, `${what}, the spans`).map((m) => {
          const q = obj(m, `${what}, a span`),
            tapeUnit = q.tapeUnit;
          return {
            a: pt(q.a, `${what}, a span`),
            b: q.b === null ? null : pt(q.b, `${what}, a span`),
            ...(q.tape !== undefined
              ? { tape: text(q.tape, `${what}, a tape reading`, 40) }
              : {}),
            ...(tapeUnit !== undefined
              ? {
                  tapeUnit: isUnit(tapeUnit)
                    ? tapeUnit
                    : fail(`${what}, a tape reading`),
                }
              : {}),
            ...(q.known !== undefined
              ? { known: bool(q.known, `${what}, a span`) }
              : {}),
          };
        }),
        shapes: list(r.shapes, `${what}, the shapes`).map((s) => {
          const q = obj(s, `${what}, a shape`),
            kind = q.kind;
          return {
            kind:
              kind === "path" || kind === "area" || kind === "edge"
                ? kind
                : fail(`${what}, a shape`),
            pts: pts(q.pts, `${what}, a shape`),
            done: bool(q.done, `${what}, a shape`),
          };
        }),
        lensOn: bool(r.lensOn, `${what}, the lens switch`),
        source: source
          ? {
              w: num(source.w, `${what}, its size`),
              h: num(source.h, `${what}, its size`),
            }
          : null,
        scale: num(r.scale, `${what}, its scale`),
      },
      known: {
        extraRefs: list(k.extraRefs, `${what}, the known sizes`, 50).map(
          (e) => {
            const q = obj(e, `${what}, a further reference`);
            return {
              label: text(q.label, `${what}, a further reference`),
              long: num(q.long, `${what}, a further reference`),
              short: num(q.short, `${what}, a further reference`),
              corners: pts(q.corners, `${what}, a further reference`, 4),
            };
          },
        ),
        tapeSd: text(k.tapeSd, `${what}, the tape uncertainty`, 40),
      },
      box: {
        w: num(b.w, `${what}, the box`),
        d: num(b.d, `${what}, the box`),
        h: num(b.h, `${what}, the box`),
        at: b.at === null ? null : pt(b.at, `${what}, the box`),
        rot: num(b.rot, `${what}, the box`),
      },
      walls: {
        corners,
        closed: bool(w.closed, `${what}, the walls`),
        pick:
          pick === null || (Number.isInteger(pick) && corners[pick])
            ? pick
            : fail(`${what}, the walls`),
      },
    };
  if (
    !(out.ruler.scale > 0) ||
    !(out.box.w > 0 && out.box.d > 0 && out.box.h > 0)
  )
    fail(what);
  if (o.picture !== undefined) {
    const url = text(o.picture, `${what}, its picture`, MAX_FILE_BYTES);
    // Only a still picture this page can decode, and never a document.
    if (!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]*$/.test(url))
      refuse(`${what} holds a picture that is not a JPEG or PNG`);
    out.picture = url;
  }
  return out;
}

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
        view(v, i + 1),
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
