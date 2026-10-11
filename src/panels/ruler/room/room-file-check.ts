/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The checks a room file is read with: each takes a value of unknown shape
// and gives it back typed, or refuses with the name of the part that is
// wrong. Pure.
import type { Pt } from "../homography";
import { isUnit } from "../units";
import { MAX_FILE_BYTES, type SavedView } from "./room-file";

/** Largest counts a file may hold; more is a damaged or hostile file. */
export const MAX = { views: 24, list: 5000, text: 400 };
export class Bad extends Error {}
/** Refuse with a whole statement of what is wrong. */
export const refuse = (statement: string): never => {
  throw new Bad(statement);
};
/** Refuse a part that is absent or of the wrong kind. */
export const fail = (what: string): never =>
  refuse(`${what} is missing or not as it should be`);
export type Obj = Record<string, unknown>;
export const obj = (v: unknown, what: string): Obj =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : fail(what);
export const list = (v: unknown, what: string, max = MAX.list): unknown[] =>
  Array.isArray(v) && v.length <= max ? v : fail(what);
export const num = (v: unknown, what: string): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fail(what);
export const text = (v: unknown, what: string, max = MAX.text): string =>
  typeof v === "string" && v.length <= max ? v : fail(what);
export const bool = (v: unknown, what: string): boolean =>
  typeof v === "boolean" ? v : fail(what);
export const pt = (v: unknown, what: string): Pt => {
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

/** One picture's saved state, checked field by field. `n` counts from 1. */
export function savedView(v: unknown, n: number): SavedView {
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
