/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFlag, writeFlag } from "../../shell/storage";
import type {
  Box,
  Detection,
  FinerExtra,
  LiveOptions,
} from "../../vision/types";

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

const overlap = (a: Box, b: Box) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
    h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y),
    inter = Math.max(0, w) * Math.max(0, h);
  return inter / Math.max(1e-9, a.w * a.h + b.w * b.h - inter);
};

/** The finer name of a tracked box: that of the detection with the same label
 * whose box overlaps it most (above 0.3 IoU) and that has one. A track's box
 * can be a little off the detection it came from, so it is matched, not
 * assumed. Null when there is none. */
export function finerFor(
  track: { label: string; box: Box },
  detections: readonly Detection[],
): { label: string; score: number } | null {
  let best: Detection | null = null,
    bestIou = 0.3;
  for (const d of detections) {
    if (!d.finer || d.label !== track.label) continue;
    const value = overlap(track.box, d.box);
    if (value > bestIou) {
      best = d;
      bestIou = value;
    }
  }
  return best?.finer ?? null;
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
