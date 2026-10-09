/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFlag, writeFlag } from "../../shell/storage";
import type { FinerExtra, LiveOptions } from "../../vision/types";

// Finer names for Objects: an ImageNet classifier names the crop of each
// detected object next to the detector's own label. Off by default, kept on
// this device only. The classifier model is fetched only once this is on.
export const FINER_MODEL = "efficientnet_lite0.tflite";
/** The lowest classifier score that is ever shown. */
export const FINER_FLOOR = 0.3;
/** At most this many crops are classified per frame. */
export const FINER_PER_PASS = 3;
/** An object that was named is named again after this long (ms), not sooner. */
export const FINER_EVERY_MS = 1000;

const KEY = "spectra.finer.v1";
let on: boolean | undefined;
const listeners = new Set<() => void>();
export const finerOn = (): boolean => (on ??= readFlag(KEY) === "on");
export function setFiner(next: boolean) {
  if (next === finerOn()) return;
  on = next;
  writeFlag(KEY, next ? "on" : "off");
  for (const listener of [...listeners]) listener();
}
export function onFinerChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Test hook: forget the cached value so storage is read again. */
export const resetFiner = () => {
  on = undefined;
};

/** The task option the runner keeps in step with the setting. The worker reads
 * `finer` itself (public/vision-worker.js); it never reaches MediaPipe. */
export const finerOption: LiveOptions = {
  current: () => ({
    finer: finerOn()
      ? {
          model: FINER_MODEL,
          floor: FINER_FLOOR,
          perPass: FINER_PER_PASS,
          everyMs: FINER_EVERY_MS,
        }
      : null,
  }),
  subscribe: onFinerChange,
};

/** The finer name of a tracked box: the one carried by the track itself. A
 * track is built from its own detection (the tracker copies the detection's
 * fields into it), so its name is read, never looked up again by overlap: a
 * lookup could hand a box the name of a neighbour when the two overlap or when
 * the tracks are one result behind the detections. Null when its own crop had
 * no name above the floor. */
export function finerFor(track: {
  finer?: { label: string; score: number };
}): { label: string; score: number } | null {
  return track.finer ?? null;
}

/** The "chair 76% · rocking chair 41%" text shared by the stage label and the
 * inspector row: the detector's name, then the finer one with its own score. */
export const finerText = (finer: { label: string; score: number }) =>
  `${finer.label} ${Math.round(finer.score * 100)}%`;

/** `extra.finer` of an object result, or null when Finer names is off. */
export const finerInfo = (extra: unknown): FinerExtra | null => {
  const info = (extra as { finer?: FinerExtra } | undefined)?.finer;
  return info && typeof info.state === "string" ? info : null;
};
