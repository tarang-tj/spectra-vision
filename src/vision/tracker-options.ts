/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
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
  /** A confirmed track that a result misses is still returned, marked `held`
   * and placed where its velocity puts it, for this many results in a row.
   * 0 returns only what the result itself found. */
  holdMisses: number;
  /** A track is held only while it was last seen within this long (ms), so
   * slow results never leave a box standing where nothing has been seen for
   * most of a second. */
  holdMs: number;
};
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
  holdMisses: 0,
  holdMs: 600,
};
/** The settings the app is measured with: DEFAULT_TRACKER plus a two-frame
 * confirmation, so one-frame false detections get no id, and a hold of three
 * results, so one missed result does not blink a box off the screen. */
export const STEADY_TRACKER: TrackerOptions = {
  ...DEFAULT_TRACKER,
  minHits: 2,
  holdMisses: 3,
};
