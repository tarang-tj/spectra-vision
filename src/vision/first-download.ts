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

/** The loading line for these tasks, or null when none of them states a size
 * or every stated model is already stored on this device. Never throws: a
 * browser without Cache Storage is treated as having nothing stored. */
export async function firstDownloadNote(
  specs: (Pick<TaskSpec, "model" | "options"> &
    Partial<Pick<TaskSpec, "kind" | "preciseModel" | "gpuModel" | "sizes">>)[],
  base: string,
  env: {
    caches?: Pick<CacheStorage, "match">;
    registered?: () => Promise<boolean>;
  } = {
    caches: typeof caches === "undefined" ? undefined : caches,
    registered: async () =>
      !!(await navigator.serviceWorker?.getRegistration()),
  },
): Promise<string | null> {
  let bytes = 0;
  for (const spec of specs) {
    // The file the task's runner is loading now, and what that file weighs.
    const model = modelOf(spec),
      size = Number(spec.options.bytes ?? spec.sizes?.[model]);
    if (!(size > 0)) continue;
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
  if (!bytes) return null;
  let kept = false;
  try {
    kept = !!(await env.registered?.());
  } catch {
    /* No service worker here: nothing is promised. */
  }
  return downloadNote(bytes, kept);
}
