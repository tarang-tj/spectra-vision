/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Measure objects: Objects' boxes get a distance and a box size in metres.
// Off by default, kept on this device only. It runs Depth's model once per
// photo, and that model is fetched only once the switch is on AND the Ruler
// has a solved reference with a pinned focal length on the photo on stage:
// before that no map could be put in metres, so none is made.
import { cameraOf } from "../../panels/ruler/camera-of";
import { derive } from "../../panels/ruler/derive";
import { subscribePlumbs } from "../../panels/ruler/plumbs";
import { getState, subscribe } from "../../panels/ruler/state";
import { downloadGate, onConsent } from "../../shell/download-consent";
import { readFlag, writeFlag } from "../../shell/storage";
import type { OnDemandTask } from "../../vision/on-demand";
import type { Source } from "../../vision/types";
import { depthTask } from "./depth-task";

const KEY = "spectra.measure-objects.v1";
let on: boolean | undefined;
const listeners = new Set<() => void>();
export const measureOn = (): boolean => (on ??= readFlag(KEY) === "on");
export function setMeasure(next: boolean) {
  if (next === measureOn()) return;
  on = next;
  writeFlag(KEY, next ? "on" : "off");
  for (const listener of [...listeners]) listener();
}
export function onMeasureChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** Test hook: forget the cached value so storage is read again. */
export const resetMeasure = () => {
  on = undefined;
};

/** Why the depth model is not wanted: the switch is off, there is no
 * picture, the picture moves, the Ruler has no solved reference on it, or
 * that reference does not pin the focal length down. Last, and only where
 * touch is the main way in (shell/download-consent.ts): the browser is being
 * asked whether the model is already stored ("checking"), or it is not and
 * the person has not yet said yes to the download ("consent"). */
export type Why =
  | "off"
  | "none"
  | "moving"
  | "reference"
  | "focal"
  | "checking"
  | "consent";
export type Wanted = { wanted: true } | { wanted: false; why: Why };
const no = (why: Why): Wanted => ({ wanted: false, why });

/** Can a depth map of this source be put in metres? Read from the Ruler
 * alone, with no map at hand, so the answer comes before any download. The
 * conditions are those of depth-metric.ts short of the fit itself. */
export function measureWanted(source: Source | null): Wanted {
  if (!measureOn()) return no("off");
  if (!source) return no("none");
  // The Ruler's scale exists on a photo only (depth-metric.ts). A map also
  // takes up to a second to make, so on a moving picture it would describe
  // an earlier frame than the boxes.
  if (!("naturalWidth" in source.element)) return no("moving");
  const s = getState();
  if (s.generation !== source.generation || !s.source || s.corners.length < 4)
    return no("reference");
  const d = derive(s),
    camera = cameraOf(s, d);
  if (!d.sheet || !camera) return no("reference");
  if (!camera.focalResolved) return no("focal");
  // Asked last, so the question comes when the download would start.
  const gate = downloadGate(depthTask);
  return gate === "clear"
    ? { wanted: true }
    : no(gate === "ask" ? "consent" : "checking");
}

/** Objects' on-demand task: Depth's own spec, run only while wanted. */
export const measureTask: OnDemandTask = {
  spec: depthTask,
  wanted: (source) => measureWanted(source).wanted,
  subscribe(listener) {
    const offs = [
      onMeasureChange(listener),
      subscribe(listener),
      subscribePlumbs(listener),
      onConsent(listener),
    ];
    return () => offs.forEach((off) => off());
  },
};
