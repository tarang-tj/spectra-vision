import type { Box, Detection, Point, Track } from "./types";
import { assign, centre, iou, pairGain } from "./tracker-cost";
import { DEFAULT_TRACKER, type TrackerOptions } from "./tracker-options";
export { iou };
export { DEFAULT_TRACKER, STEADY_TRACKER } from "./tracker-options";
export type { TrackerOptions } from "./tracker-options";

/** Smoothing of the centre, same 1/15 s reference as `velocityBlend`. The
 * prediction is built from this smoothed centre, so box jitter cannot decide
 * which of two overlapping boxes belongs to which track. */
const CENTRE_BLEND = 0.3;
/** Results further apart than this let a track reach further: the centre gate
 * grows with the time since the track was seen, up to REACH_MAX times. */
const REACH_MS = 150;
const REACH_MAX = 3;
const REFERENCE_GAP_MS = 1000 / 15;

type Live = {
  id: number; // 0 until confirmed
  label: string;
  box: Box;
  seen: Detection; // the detection it was last matched to
  fx: number; // smoothed centre
  fy: number;
  vx: number; // centre velocity, image fractions per ms
  vy: number;
  lastSeen: number;
  hits: number;
  misses: number;
  trail: Point[];
};

export class Tracker {
  private nextId = 1;
  private tracks: Live[] = [];
  private prevTime = NaN;
  private lastGap = 0;
  private readonly o: TrackerOptions;
  constructor(options: Partial<TrackerOptions> = {}) {
    this.o = { ...DEFAULT_TRACKER, ...options };
  }
  reset() {
    this.nextId = 1;
    this.tracks = [];
    this.prevTime = NaN;
    this.lastGap = 0;
  }
  /** One result. `faint` are detections that scored under the gate but
   * within the band kept below it (track-gate.ts): one may carry on a track
   * that exists, so an object whose score wavers round the gate keeps its box
   * and its id, and none ever starts a track. */
  update(
    detections: Detection[],
    time: number,
    faint: Detection[] = [],
  ): Track[] {
    const o = this.o,
      strong = detections.length,
      all = faint.length ? [...detections, ...faint] : detections,
      limit = Math.max(o.maxAgeMs, 2.5 * this.lastGap),
      gap = time - this.prevTime,
      slow = gap > o.slowGapMs,
      previous = this.tracks.filter(
        (t) =>
          t.lastSeen >= this.prevTime ||
          (t.id
            ? time - t.lastSeen < limit
            : time - t.lastSeen < Math.max(limit, o.confirmWindowMs) ||
              t.misses < o.tentativeMisses),
      );
    // Each track's box is moved along its own velocity to where it should be now.
    const predicted = previous.map((t) => {
      const dt = Math.min(Math.max(0, time - t.lastSeen), o.maxPredictMs);
      return {
        ...t.box,
        x: t.fx + t.vx * dt - t.box.w / 2,
        y: t.fy + t.vy * dt - t.box.h / 2,
      };
    });
    const gain = previous.map((t, ti) =>
      all.map((d) =>
        pairGain(
          { ...t, confirmed: t.id > 0 },
          predicted[ti],
          d,
          o,
          slow,
          Math.min(REACH_MAX, Math.max(1, (time - t.lastSeen) / REACH_MS)),
        ),
      ),
    );
    const column = previous.length
        ? assign(gain, previous.length, all.length)
        : [],
      owner = new Map<number, Live>(),
      matched = new Set<Live>();
    column.forEach((di, ti) => {
      if (di >= 0 && gain[ti][di] > 0) {
        owner.set(di, previous[ti]);
        matched.add(previous[ti]);
      }
    });
    const current: Track[] = [],
      live: Live[] = [];
    all.forEach((d, di) => {
      const old = owner.get(di),
        c = centre(d.box);
      // A faint detection that no track took is dropped.
      if (!old && di >= strong) return;
      let track: Live;
      if (old) {
        const dt = time - old.lastSeen,
          // Weight of this sample: velocityBlend for a result 1/15 s after the
          // last, more for longer gaps, and a plain running mean while the
          // track is young.
          b = Math.max(
            1 - Math.pow(1 - o.velocityBlend, dt / REFERENCE_GAP_MS),
            1 / old.hits,
          );
        track = {
          ...old,
          box: d.box,
          seen: d,
          lastSeen: time,
          hits: old.hits + 1,
          misses: 0,
          trail: [...old.trail, c].slice(-32),
        };
        if (dt > 0) {
          // Alpha-beta filter on the centre: the prediction is built from the
          // smoothed centre, so box jitter does not move it.
          const pdt = Math.min(dt, o.maxPredictMs),
            rx = c.x - (old.fx + old.vx * pdt),
            ry = c.y - (old.fy + old.vy * pdt),
            a =
              old.hits > 1
                ? 1 - Math.pow(1 - CENTRE_BLEND, dt / REFERENCE_GAP_MS)
                : 1;
          track.fx = old.fx + old.vx * pdt + a * rx;
          track.fy = old.fy + old.vy * pdt + a * ry;
          track.vx = old.vx + (b * rx) / dt;
          track.vy = old.vy + (b * ry) / dt;
        }
      } else
        track = {
          id: 0,
          label: d.label,
          box: d.box,
          seen: d,
          fx: c.x,
          fy: c.y,
          vx: 0,
          vy: 0,
          lastSeen: time,
          hits: 1,
          misses: 0,
          trail: [c],
        };
      if (!track.id && (track.hits >= o.minHits || slow))
        track.id = this.nextId++;
      live.push(track);
      if (track.id)
        current.push({
          ...d,
          id: track.id,
          lastSeen: time,
          trail: track.trail,
        });
    });
    // Missed tracks are retained for association, never returned as fresh
    // detections. A confirmed one is returned as held for a few results, at
    // the place its velocity predicts and marked so the mode can say so.
    previous.forEach((t, ti) => {
      if (matched.has(t)) return;
      // A tentative track is pruned by age when the next result arrives.
      if (t.id && t.misses >= o.maxMisses) return;
      live.push({ ...t, misses: t.misses + 1 });
      if (t.id && t.misses < o.holdMisses && time - t.lastSeen <= o.holdMs)
        current.push({
          ...t.seen,
          box: predicted[ti],
          id: t.id,
          lastSeen: t.lastSeen,
          trail: t.trail,
          held: true,
        });
    });
    if (Number.isFinite(this.prevTime)) this.lastGap = Math.max(0, gap);
    this.prevTime = time;
    this.tracks = live;
    return current;
  }
}
