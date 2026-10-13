/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Ask before a large first download where touch is the main way in (a phone
// or a tablet, shell/device.ts): Depth's model, whether the Depth mode or
// Objects' Measure objects is what wants it. A yes is kept for this page
// load, by model file, so one yes covers both. Once the file is stored on
// the device nothing asks. Elsewhere nothing here changes anything.
import {
  firstDownloadBytes,
  megabytes,
  type Sized,
} from "../vision/first-download";
import { modelOf } from "../vision/settings";
import { touchFirst } from "./device";

/** Above this many bytes of model still to fetch, a touch-first device is
 * asked first. A design choice, not a measurement: it is above every model a
 * mode loads by itself except Depth's (tests/shell-download-consent.test.ts
 * holds that). Model files only, not the runtime. */
export const BIG_DOWNLOAD_BYTES = 30_000_000;
export const needsConsent = (
  bytes: number,
  touch: boolean,
  accepted: boolean,
) => touch && !accepted && bytes > BIG_DOWNLOAD_BYTES;

const accepted = new Set<string>(),
  // Bytes each model still has to fetch; null while that is being looked up.
  toFetch = new Map<string, number | null>(),
  listeners = new Set<() => void>();
let version = 0;
const announce = () => {
  version++;
  for (const listener of [...listeners]) listener();
};
/** Goes up at every change, for a component to follow. */
export const consentVersion = () => version;
/** Called when a yes was given or a size became known. */
export function onConsent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
/** The person said yes to fetching this model file. */
export function acceptDownload(model: string) {
  if (accepted.has(model)) return;
  accepted.add(model);
  announce();
}
export const downloadAccepted = (model: string) => accepted.has(model);

export type Gate = "clear" | "checking" | "ask";
type Env = Parameters<typeof firstDownloadBytes>[2];
/** May this task's model be fetched now? "checking" while the browser is
 * asked whether the file is already stored (listeners hear the answer),
 * "ask" when the person has to say yes first. Always "clear" where the main
 * pointer is not touch. */
export function downloadGate(spec: Sized, base?: string, env?: Env): Gate {
  if (!touchFirst()) return "clear";
  const model = modelOf(spec);
  if (accepted.has(model)) return "clear";
  const bytes = toFetch.get(model);
  if (bytes === undefined) {
    toFetch.set(model, null);
    const from = base ?? new URL(import.meta.env.BASE_URL, location.href).href;
    void firstDownloadBytes([spec], from, env).then((found) => {
      toFetch.set(model, found);
      announce();
    });
    return "checking";
  }
  if (bytes === null) return "checking";
  return needsConsent(bytes, true, false) ? "ask" : "clear";
}
export const downloadCleared = (spec: Sized, base?: string, env?: Env) =>
  downloadGate(spec, base, env) === "clear";

/** The card's words. `name` is what wants the model ("Depth"). */
export const consentWords = (name: string, bytes: number, kept: boolean) => ({
  title: `${name} needs a ${megabytes(bytes)} download`,
  text:
    `${name}'s model is ${megabytes(bytes)}, plus its runtime. Nothing is shown in ${name} until it has arrived.` +
    (kept ? " It is kept on this device afterwards." : ""),
  accept: `Download ${megabytes(bytes)}`,
  decline: "Not now",
});

/** Test hook: forget every yes and every size. */
export const resetConsent = () => {
  accepted.clear();
  toFetch.clear();
};
