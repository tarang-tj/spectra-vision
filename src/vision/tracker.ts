import type { Box, Detection, Point, Track } from "./types";
export function iou(a: Box, b: Box) {
  const overlap =
    Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return overlap / Math.max(1e-9, a.w * a.h + b.w * b.h - overlap);
}

/** How tracks are matched and kept. Times are in the clock of `update`. */
export type TrackerOptions = {
  /** Frames a new object must be seen in, one after the other, before it gets
   * an id and is returned. 1 shows every detection at once. Hits need not
   * follow each other, but a tentative object missed more than
   * `tentativeMisses` times is forgotten, so a flicker never takes an id. */
  minHits: number;
  /** A confirmed track survives this many missed frames in a row. */
  maxMisses: number;
  /** A tentative track survives this many misses before it is forgotten, so
   * an object that is found on alternate frames is still confirmed. */
  tentativeMisses: number;
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
  /** Weight of the newest velocity sample in the running velocity (0..1). */
  velocityBlend: number;
  /** The box is moved along its velocity for at most this long (ms). */
  maxPredictMs: number;
};
export const DEFAULT_TRACKER: TrackerOptions = {
  minHits: 1,
  maxMisses: 10,
  tentativeMisses: 2,
  slowGapMs: 400,
  maxAgeMs: 900,
  minIou: 0.15,
  maxCentre: 0.075,
  velocityBlend: 0.5,
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
  vx: number; // centre velocity, image fractions per ms
  vy: number;
  lastSeen: number;
  hits: number;
  misses: number;
  trail: Point[];
};
const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** Assignment that maximizes the total of `gain` (rows = tracks, columns =
 * detections); a pair with gain 0 is treated as unassigned. Hungarian
 * algorithm on a square matrix padded with zeros. Returns column per row. */
function assign(gain: number[][], rows: number, cols: number): number[] {
  const n = Math.max(rows, cols),
    cost = (i: number, j: number) => (i < rows && j < cols ? -gain[i][j] : 0),
    u = new Array<number>(n + 1).fill(0),
    v = new Array<number>(n + 1).fill(0),
    p = new Array<number>(n + 1).fill(0),
    way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity),
      used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity,
        j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++)
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const column = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= n; j++)
    if (p[j] >= 1 && p[j] <= rows && j <= cols) column[p[j] - 1] = j - 1;
  return column;
}

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
        (t) => t.lastSeen >= this.prevTime || time - t.lastSeen < limit,
      );
    // Each track's box is moved along its own velocity to where it should be now.
    const predicted = previous.map((t) => {
      const dt = Math.min(Math.max(0, time - t.lastSeen), o.maxPredictMs);
      return {
        ...t.box,
        x: t.box.x + t.vx * dt,
        y: t.box.y + t.vy * dt,
      };
    });
    const gain = previous.map((t, ti) =>
      detections.map((d) => {
        if (d.label !== t.label) return 0;
        // Allowed when either the predicted or the last seen box fits.
        let allowed = false;
        for (const box of [predicted[ti], t.box]) {
          const c = centre(box),
            e = centre(d.box);
          if (
            iou(d.box, box) > o.minIou ||
            Math.hypot(e.x - c.x, e.y - c.y) < o.maxCentre
          )
            allowed = true;
        }
        if (!allowed) return 0;
        const c = centre(predicted[ti]),
          e = centre(d.box);
        return (
          1e-6 +
          Math.max(0, iou(d.box, predicted[ti])) +
          0.15 * Math.max(0, 1 - Math.hypot(e.x - c.x, e.y - c.y))
        );
      }),
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
          oc = centre(old.box),
          b = old.hits > 1 ? o.velocityBlend : 1;
        track = {
          ...old,
          box: d.box,
          lastSeen: time,
          hits: old.hits + 1,
          misses: 0,
          trail: [...old.trail, c].slice(-32),
        };
        if (dt > 0) {
          track.vx = (1 - b) * old.vx + (b * (c.x - oc.x)) / dt;
          track.vy = (1 - b) * old.vy + (b * (c.y - oc.y)) / dt;
        }
      } else
        track = {
          id: 0,
          label: d.label,
          box: d.box,
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
    // detections. A tentative one is kept through `tentativeMisses` misses.
    for (const t of previous)
      if (
        !matched.has(t) &&
        t.misses < (t.id ? o.maxMisses : o.tentativeMisses)
      )
        live.push({ ...t, misses: t.misses + 1 });
    if (Number.isFinite(this.prevTime)) this.lastGap = Math.max(0, gap);
    this.prevTime = time;
    this.tracks = live;
    return current;
  }
}
