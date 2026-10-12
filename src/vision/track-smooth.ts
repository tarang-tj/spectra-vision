/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The smoothed view of object tracks, for drawing only. The tracks handed in
// are never changed: they still feed the inspector, the effects, the Lab and
// the session export.
import { OneEuroFilter } from "../measure/one-euro";
import type { OneEuroOptions } from "../measure/one-euro";
import type { Track } from "./types";

/** One Euro settings for a box's centre and size, in image fractions. Chosen
 * on recorded camera results (see the v2.5 detection report): of the three
 * settings replayed, the least movement of a still box between results with
 * the drawn centre trailing a slow pan by a few pixels. Fast motion was not
 * recorded; `beta` is what lets the box follow it. */
export const BOX_ONE_EURO: OneEuroOptions = { minCutoff: 0.5, beta: 30 };

/** Turns the tracks of each new result into copies whose boxes went through a
 * One Euro filter, one per track id: centre and size, so a box neither
 * shimmers nor breathes. A track that is gone is forgotten. */
export class TrackSmoother {
  private filters = new Map<number, OneEuroFilter[]>();

  reset() {
    this.filters.clear();
  }

  /** The tracks of the result at `time`, in the same order, boxes smoothed. */
  apply(tracks: readonly Track[], time: number): Track[] {
    const kept = new Map<number, OneEuroFilter[]>(),
      out = tracks.map((t) => {
        const f =
            this.filters.get(t.id) ??
            [0, 1, 2, 3].map(() => new OneEuroFilter(BOX_ONE_EURO)),
          b = t.box,
          cx = f[0].filter(b.x + b.w / 2, time),
          cy = f[1].filter(b.y + b.h / 2, time),
          w = f[2].filter(b.w, time),
          h = f[3].filter(b.h, time);
        kept.set(t.id, f);
        return { ...t, box: { x: cx - w / 2, y: cy - h / 2, w, h } };
      });
    this.filters = kept;
    return out;
  }
}
