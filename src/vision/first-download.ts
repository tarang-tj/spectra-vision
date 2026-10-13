/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the stage says while a large model is fetched for the first time: its
// size, once, and that it is kept afterwards. A task takes part by stating
// its model's size in `options.bytes` (Depth does, from scripts/models.json),
// or the size of each file it may load in `sizes` (Objects does: which file
// it loads depends on the delegate and the Precision setting).
import { modelOf } from "./settings";
import type { TaskSpec } from "./types";

/** A file size as people say it: "99 MB". */
export const megabytes = (bytes: number) => `${Math.round(bytes / 1e6)} MB`;

/** The loading line for a first download. `kept` is whether this browser
 * will store the file (a service worker is registered); it is not promised
 * otherwise. The stage adds its own ellipsis. */
export const downloadNote = (bytes: number, kept: boolean) =>
  `Downloading this mode's model: ${megabytes(bytes)}, one time` +
  (kept ? ". It is kept on this device afterwards" : "");

/** As much of a task as its download size is read from. */
export type Sized = Pick<TaskSpec, "model" | "options"> &
  Partial<
    Pick<
      TaskSpec,
      "kind" | "preciseModel" | "gpuModel" | "sharpModel" | "sizes"
    >
  >;
type Env = {
  caches?: Pick<CacheStorage, "match">;
  registered?: () => Promise<boolean>;
};
const browser = (): Env => ({
  caches: typeof caches === "undefined" ? undefined : caches,
  registered: async () => !!(await navigator.serviceWorker?.getRegistration()),
});

/** What the file this task's runner is loading now weighs, or 0 when the
 * task states no size. */
export const statedBytes = (spec: Sized): number => {
  const size = Number(spec.options.bytes ?? spec.sizes?.[modelOf(spec)]);
  return size > 0 ? size : 0;
};

/** The bytes of model these tasks still have to fetch: 0 when none of them
 * states a size or every stated model is already stored on this device.
 * Never throws: a browser without Cache Storage is treated as having nothing
 * stored. Model files only, not the runtime. */
export async function firstDownloadBytes(
  specs: Sized[],
  base: string,
  env: Env = browser(),
): Promise<number> {
  let bytes = 0;
  for (const spec of specs) {
    const model = modelOf(spec),
      size = statedBytes(spec);
    if (!size) continue;
    let stored = false;
    try {
      // By address alone, as the service worker matches it (public/sw.js).
      stored = !!(await env.caches?.match(`${base}models/${model}`, {
        ignoreVary: true,
      }));
    } catch {
      /* Storage blocked: nothing is known to be stored. */
    }
    if (!stored) bytes += size;
  }
  return bytes;
}

/** Whether this browser will keep a fetched model (a service worker is
 * registered). False when that cannot be known. */
export async function keepsDownloads(env: Env = browser()): Promise<boolean> {
  try {
    return !!(await env.registered?.());
  } catch {
    /* No service worker here: nothing is promised. */
    return false;
  }
}

/** The loading line for these tasks, or null when there is nothing left to
 * fetch (see `firstDownloadBytes`). */
export async function firstDownloadNote(
  specs: Sized[],
  base: string,
  env: Env = browser(),
): Promise<string | null> {
  const bytes = await firstDownloadBytes(specs, base, env);
  return bytes ? downloadNote(bytes, await keepsDownloads(env)) : null;
}
