/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The whole room from its pictures: which pictures are on the plan and why
// the others are not, where every room point is, and the outline's numbers.
// The first picture's frame is the room's. A later picture joins only through
// points marked both in it and in a picture already on the plan, and a
// picture that was refused contributes nothing: not a point, not a pixel.
// Pure: no DOM, no clock.
import type { Pt } from "../homography";
import {
  IDENTITY,
  placeView,
  type Anchor,
  type Placement,
  type Rigid,
} from "./room-frame";
import { reflections, symmetries } from "./room-symmetry";
import {
  combine,
  covOf,
  moved,
  outlineNumbers,
  sampleOf,
  type OutlineNumbers,
  type Sample,
  type ViewFrame,
} from "./room-merge";
import { statusOf, type ViewStatus } from "./room-status";
import { picturesText } from "./text";

export { toOwn } from "./floor-maths";
export type { ViewStatus } from "./room-status";

/** A point on the room's floor, marked in one picture or in several. `at` is
 * the tap in that picture, source pixels. */
export type RoomPoint = {
  id: number;
  obs: readonly { view: number; at: Pt }[];
};
export type RoomInput = {
  /** The room's pictures in strip order; `frame` is null until the picture's
   * own reference is solved. */
  views: readonly {
    id: number;
    name: string;
    frame: ViewFrame | null;
    /** The frame this picture would have with its reference's long and
     * short sides swapped, worked out only when a refusal asks for it. */
    swapped?: () => ViewFrame | null;
  }[];
  points: readonly RoomPoint[];
  /** Point ids in order round the room. */
  outline: readonly number[];
  closed: boolean;
};
export type Placed = {
  id: number;
  /** In the room's frame; null when no picture on the plan shows the point
   * or it cannot be measured there. */
  sample: Sample | null;
  /** Each picture's own estimate, room frame. */
  seen: { view: number; at: Pt }[];
  /** With two pictures or more: the furthest any two put it apart, mm. */
  apartMm: number | null;
};
export type RoomSolution = {
  views: ViewStatus[];
  points: Placed[];
  /** The outline's corners that are on the plan, in order. */
  corners: Placed[];
  /** Null while a corner of the outline is not on the plan. */
  numbers: OutlineNumbers | null;
  /** Ids of the pictures each wall, and the outline as a whole, rest on. */
  wallViews: number[][];
  outlineViews: number[];
  /** Outline corners that no picture on the plan shows. */
  missing: number[];
};

export const pointName = (id: number) => `Room point ${id}`;

type Own = { sample: Sample; view: number; point: number };

/** Solve the room. */
export function solveRoom(input: RoomInput): RoomSolution {
  const { views, points } = input,
    first = views[0],
    base = first?.frame ?? null,
    frames = new Map(views.map((v) => [v.id, v.frame])),
    order = views.map((v) => v.id),
    // Every marked point as its own picture sees it.
    own: Own[] = points.flatMap((p) =>
      p.obs.flatMap((o) => {
        const frame = frames.get(o.view),
          sample = frame ? sampleOf(frame, o.at, p.id) : null;
        return sample ? [{ sample, view: o.view, point: p.id }] : [];
      }),
    ),
    // One anchor per point this picture shares with the plan: its own
    // position against where the pictures already placed put it together.
    anchorsOf = (id: number, on: Map<number, Rigid>): Anchor[] =>
      own
        .filter((h) => h.view === id)
        .flatMap((h) => {
          const here = covOf(h.sample),
            there = combine(
              own
                .filter((t) => t.point === h.point && on.has(t.view))
                .flatMap((t) => {
                  const sample = moved(t.sample, on.get(t.view)!),
                    cov = covOf(sample);
                  return cov ? [{ sample, cov }] : [];
                }),
            ),
            cov = there ? covOf(there) : null;
          return here && there && cov
            ? [
                {
                  name: pointName(h.point),
                  pictures: picturesText(
                    [
                      id,
                      ...own
                        .filter((t) => t.point === h.point && on.has(t.view))
                        .map((t) => t.view),
                    ],
                    order,
                  ),
                  here: { at: h.sample.at, cov: here },
                  there: { at: there.at, cov },
                },
              ]
            : [];
        }),
    result = new Map<number, Placement>(),
    on = new Map<number, Rigid>();
  if (base) on.set(first.id, IDENTITY);
  // A picture joins when its anchors to the pictures already on the plan
  // place it. Every point two placed pictures share is therefore checked,
  // from the side of the one that joined later: a picture whose points
  // disagree with any picture before it stays off. Pictures that could not
  // join are tried again whenever another one has.
  for (let grew = !!base; grew; ) {
    grew = false;
    for (const v of views) {
      if (on.has(v.id) || !v.frame || !base) continue;
      const p = placeView(
        v.name,
        symmetries(v.frame.plane, base.plane),
        anchorsOf(v.id, on),
        reflections(v.frame.plane, base.plane),
      );
      result.set(v.id, p);
      if (p.state === "placed") {
        on.set(v.id, p.rigid);
        grew = true;
      }
    }
  }
  // A picture refused because a point lands apart: would it join if one
  // picture's reference were read with its sides the other way round? Tried
  // for the refused picture and for the first one, and said only when the
  // rest of the plan still stands.
  for (const v of views) {
    const p = result.get(v.id);
    if (p?.state !== "refused" || p.reason !== "apart") continue;
    const fitting = (v.id === first.id ? [v] : [v, first]).filter((c) => {
      const frame = c.swapped?.();
      if (!frame) return false;
      const again = solveRoom({
          views: views
            .filter((w) => on.has(w.id) || w.id === v.id)
            .map((w) => ({
              id: w.id,
              name: w.name,
              frame: w.id === c.id ? frame : w.frame,
            })),
          points,
          outline: [],
          closed: false,
        }),
        fits = (id: number) => {
          const s = again.views.find((w) => w.id === id)?.state;
          return s === "first" || s === "placed" || s === "provisional";
        };
      return fits(v.id) && [...on.keys()].every(fits);
    });
    // Two pictures alone cannot say which of them reads the sheet wrongly:
    // swapping either makes them agree. Then both are named.
    if (fitting.length)
      result.set(v.id, {
        ...p,
        text: `${p.text} With the long and short sides of ${fitting.map((c) => `${c.name}'s`).join(" or of ")} reference swapped, the pictures agree: ${
          fitting.length === 1
            ? `show ${fitting[0].name} and press Swap sides.`
            : `look at the lengths written on the sheet's edges in each to see which is wrong, and press Swap sides there.`
        }`,
      });
  }
  const status = statusOf(views, on, result);
  const placed = points.map((p): Placed => {
    const seen = own
        .filter((h) => h.point === p.id && on.has(h.view))
        .flatMap((h) => {
          const sample = moved(h.sample, on.get(h.view)!),
            cov = covOf(sample);
          return cov ? [{ view: h.view, sample, cov }] : [];
        }),
      ats = seen.map((s) => s.sample.at);
    let apart: number | null = null;
    for (let i = 0; i < ats.length; i++)
      for (let j = i + 1; j < ats.length; j++)
        apart = Math.max(
          apart ?? 0,
          Math.hypot(ats[i].x - ats[j].x, ats[i].y - ats[j].y),
        );
    return {
      id: p.id,
      sample: seen.length ? combine(seen) : null,
      seen: seen.map((s) => ({ view: s.view, at: s.sample.at })),
      apartMm: apart,
    };
  });
  const byId = new Map(placed.map((p) => [p.id, p])),
    wanted = input.outline.map((id) => byId.get(id) ?? null),
    missing = input.outline.filter((id) => !byId.get(id)?.sample),
    corners = wanted.filter((p): p is Placed => !!p?.sample),
    whole = !missing.length && corners.length >= 2,
    viewsOf = (ps: Placed[]) =>
      [...new Set(ps.flatMap((p) => p.seen.map((s) => s.view)))].sort(
        (a, b) => a - b,
      ),
    sides = whole ? (input.closed ? corners.length : corners.length - 1) : 0;
  return {
    views: status,
    points: placed,
    corners,
    numbers: whole
      ? outlineNumbers(
          corners.map((c) => c.sample!),
          input.closed && corners.length >= 3,
        )
      : null,
    wallViews: Array.from({ length: sides }, (_, i) =>
      viewsOf([corners[i], corners[(i + 1) % corners.length]]),
    ),
    outlineViews: viewsOf(corners),
    missing,
  };
}
