/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The whole room from its pictures: which pictures are on the plan and why
// the others are not, where every room point is, and the outline's numbers.
// The first picture's frame is the room's. A later picture joins only through
// points marked both in it and in a picture already on the plan, and a
// picture that was refused contributes nothing: not a point, not a pixel.
// Pure: no DOM, no clock.
import type { Pt } from "../homography";
import {
  applyRigid,
  IDENTITY,
  placeView,
  symmetries,
  type Anchor,
  type AnchorCheck,
  type Placement,
  type Rigid,
} from "./room-frame";
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

/** A point on the room's floor, marked in one picture or in several. `at` is
 * the tap in that picture, source pixels. */
export type RoomPoint = {
  id: number;
  obs: readonly { view: number; at: Pt }[];
};
export type RoomInput = {
  /** The room's pictures in strip order; `frame` is null until the picture's
   * own reference is solved. */
  views: readonly { id: number; name: string; frame: ViewFrame | null }[];
  points: readonly RoomPoint[];
  /** Point ids in order round the room. */
  outline: readonly number[];
  closed: boolean;
};
export type ViewStatus = {
  id: number;
  name: string;
  state: "first" | "placed" | "refused" | "unanchored" | "no-reference";
  /** Its frame to the room's; null unless it is on the plan. */
  rigid: Rigid | null;
  text: string;
  checks: AnchorCheck[];
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
    // Every marked point as its own picture sees it.
    own: Own[] = points.flatMap((p) =>
      p.obs.flatMap((o) => {
        const frame = frames.get(o.view),
          sample = frame ? sampleOf(frame, o.at, p.id) : null;
        return sample ? [{ sample, view: o.view, point: p.id }] : [];
      }),
    ),
    anchorsOf = (id: number, on: Map<number, Rigid>): Anchor[] =>
      own
        .filter((h) => h.view === id)
        .flatMap((h) => {
          const here = covOf(h.sample);
          if (!here) return [];
          return own
            .filter((t) => t.point === h.point && t.view !== id)
            .flatMap((t) => {
              const rigid = on.get(t.view),
                there = rigid ? moved(t.sample, rigid) : null,
                cov = there ? covOf(there) : null;
              return there && cov
                ? [
                    {
                      name: pointName(h.point),
                      here: { at: h.sample.at, cov: here },
                      there: { at: there.at, cov },
                    },
                  ]
                : [];
            });
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
      );
      result.set(v.id, p);
      if (p.state === "placed") {
        on.set(v.id, p.rigid);
        grew = true;
      }
    }
  }
  const status = views.map((v, i): ViewStatus => {
    const p = result.get(v.id),
      rigid = on.get(v.id) ?? null;
    if (!v.frame)
      return {
        id: v.id,
        name: v.name,
        state: "no-reference",
        rigid: null,
        checks: [],
        text: `${v.name} has no reference yet. Tap its four corners in that picture.`,
      };
    if (i === 0)
      return {
        id: v.id,
        name: v.name,
        state: "first",
        rigid: IDENTITY,
        checks: [],
        text: `${v.name} sets the plan's frame: the plan is drawn as its reference reads.`,
      };
    if (!p)
      return {
        id: v.id,
        name: v.name,
        state: "unanchored",
        rigid: null,
        checks: [],
        text: `${v.name} is not on the plan yet: ${first.name} has no reference to set the plan's frame.`,
      };
    return {
      id: v.id,
      name: v.name,
      state: p.state,
      rigid: p.state === "placed" ? rigid : null,
      text: p.text,
      checks: p.checks,
    };
  });
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

/** A room-frame position as picture `rigid` reads it in its own frame. */
export const toOwn = (rigid: Rigid, p: Pt): Pt =>
  applyRigid(
    {
      turn: rigid.turn,
      a: rigid.a,
      b: -rigid.b,
      tx: -(rigid.a * rigid.tx + rigid.b * rigid.ty),
      ty: -(-rigid.b * rigid.tx + rigid.a * rigid.ty),
    },
    p,
  );
