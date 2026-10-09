import type { Box, Detection, Point, Track } from "./types";
import { assign, centre, iou, pairGain } from "./tracker-cost";
export { iou };

/** How tracks are matched and kept. Times are in the clock of `update`. */
export type TrackerOptions = {
  /** Sightings a new object needs before it gets an id and is returned. 1
   * shows every detection at once. The sightings need not follow each other:
   * a tentative object is kept for `confirmWindowMs` after its last sighting,
   * so an object found only on every 4th or 5th frame is still confirmed. */
  minHits: number;
  /** A confirmed track survives this many missed frames in a row. */
  maxMisses: number;
  /** A tentative track also survives this many misses, whatever their timing. */
  tentativeMisses: number;
  /** A tentative track is forgotten when not seen for this long (ms). */
  confirmWindowMs: number;
  /** A tentative track only takes a detection overlapping its box by more than
   * this (IoU); with no velocity yet, a loose gate would chain flickers. */
  tentativeIou: number;
  /** When results arrive further apart than this (ms), a new object is
   * confirmed at once: waiting a whole extra result costs more than a flicker. */
  slowGapMs: number;
  /** A track not seen for this long (ms) is forgotten. The limit grows to 2.5
   * times the last gap between results, and a track is never forgotten before
   * it has had one result to match. */
  maxAgeMs: number;
  /** A detection may join a track when its box overlaps the track's by more
   * than this (IoU), or when the centres are closer than `maxCentre`. */
  minIou: number;
  maxCentre: number;
  /** Weight of the newest velocity sample in the running velocity (0..1), for
   * a result 1/15 s after the previous one. Low means a steady velocity that
   * jittery boxes cannot swing. */
  velocityBlend: number;
  /** The box is moved along its velocity for at most this long (ms). */
  maxPredictMs: number;
};
/** Smoothing of the centre, same 1/15 s reference as `velocityBlend`. The
 * prediction is built from this smoothed centre, so box jitter cannot decide
 * which of two overlapping boxes belongs to which track. */
const CENTRE_BLEND = 0.3;
/** Results further apart than this let a track reach further: the centre gate
 * grows with the time since the track was seen, up to REACH_MAX times. */
const REACH_MS = 150;
const REACH_MAX = 3;
const REFERENCE_GAP_MS = 1000 / 15;
export const DEFAULT_TRACKER: TrackerOptions = {
  minHits: 1,
  maxMisses: 10,
  tentativeMisses: 2,
  confirmWindowMs: 1000,
  tentativeIou: 0.5,
  slowGapMs: 400,
  maxAgeMs: 900,
  minIou: 0.15,
  maxCentre: 0.075,
  velocityBlend: 0.08,
  maxPredictMs: 400,
};
/** The settings the app is measured with: DEFAULT_TRACKER plus a two-frame
 * confirmation, so one-frame false detections get no id. */
export const STEADY_TRACKER: TrackerOptions = {
  ...DEFAULT_TRACKER,
  minHits: 2,
};

type Live = {
  id: number; // 0 until confirmed
  label: string;
  box: Box;
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
  update(detections: Detection[], time: number): Track[] {
    const o = this.o,
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
      detections.map((d) =>
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
        ? assign(gain, previous.length, detections.length)
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
    detections.forEach((d, di) => {
      const old = owner.get(di),
        c = centre(d.box);
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
    // Missed tracks are retained for association only, never rendered as fresh
    // detections.
    for (const t of previous)
      if (
        !matched.has(t) &&
        // A tentative track is pruned by age when the next result arrives.
        (t.id ? t.misses < o.maxMisses : true)
      )
        live.push({ ...t, misses: t.misses + 1 });
    if (Number.isFinite(this.prevTime)) this.lastGap = Math.max(0, gap);
    this.prevTime = time;
    this.tracks = live;
    return current;
  }
}
