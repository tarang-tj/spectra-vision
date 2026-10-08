/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import pkg from "../../package.json";

/** The content hash in a built script's file name ("index-B4x9kQ2p.js"), or
 * "0" when there is none. It changes with every deploy that changes the app,
 * which is what gives each deploy its own shell cache. */
export function buildVersion(scriptUrl: string): string {
  return /-([A-Za-z0-9_-]{6,})\.js(?:$|[?#])/.exec(scriptUrl)?.[1] ?? "0";
}

/** The MediaPipe runtime version this build was made with (pinned exactly in
 * package.json). It names the cache of runtime and model files, so an upgrade
 * of the dependency starts that cache afresh. */
export const RUNTIME_VERSION: string =
  pkg.dependencies["@mediapipe/tasks-vision"];

/** Address of the service worker for a base path ("/" or "/spectra-vision/"):
 * `v` is the shell version, `r` the runtime version. */
export function workerUrl(
  base: string,
  version: string,
  runtime = RUNTIME_VERSION,
): string {
  return `${base}sw.js?v=${encodeURIComponent(version)}&r=${encodeURIComponent(runtime)}`;
}

/** A request that got its file. Failed requests are listed by the browser
 * too (an offline attempt at a model, say) and must not be fetched again on
 * the page's behalf. */
const succeeded = (entry: PerformanceEntry): boolean => {
  const timing = entry as PerformanceResourceTiming;
  return typeof timing.responseStatus === "number"
    ? timing.responseStatus === 200
    : timing.decodedBodySize > 0;
};

/** Everything this page has really fetched from its own origin so far, with
 * the page itself first. */
const pageFiles = (): string[] => [
  location.href.split(/[?#]/)[0],
  ...performance
    .getEntriesByType("resource")
    .filter(
      (entry) => entry.name.startsWith(location.origin) && succeeded(entry),
    )
    .map((entry) => entry.name),
];

/** Ask the service worker to keep files that were already fetched: the ones
 * given (a vision worker's own list) and everything the page has loaded so
 * far. It is sent again on every model load, so nothing rests on what had
 * been fetched at the moment the worker became active. Every worker of the
 * registration gets it: after a deploy the new one may still be waiting, and
 * it is the one whose cache will be used. A no-op in development and wherever
 * service workers are unavailable. */
export function adoptFetched(urls: readonly string[] = []): void {
  if (!import.meta.env.PROD) return;
  try {
    void navigator.serviceWorker?.ready
      .then((registration) => {
        const message = { type: "adopt", urls: [...pageFiles(), ...urls] };
        for (const worker of [
          registration.installing,
          registration.waiting,
          registration.active,
        ])
          worker?.postMessage(message);
      })
      .catch(() => {});
  } catch {
    /* No service worker support: the app simply stays online-only. */
  }
}

/** Resolves once a worker is active, or never if it is discarded first (a
 * newer one replaced it, and that one gets its own page load). */
const activated = (worker: ServiceWorker) =>
  new Promise<void>((resolve) => {
    if (worker.state === "activated") return resolve();
    const onChange = () => {
      if (worker.state !== "activated") return;
      worker.removeEventListener("statechange", onChange);
      resolve();
    };
    worker.addEventListener("statechange", onChange);
  });

/** Register the service worker. Production only: in development it would
 * serve stale modules and fight hot reload. A failure is logged as one console
 * warning and otherwise ignored: the studio works the same without it. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  const start = async () => {
    try {
      const base = import.meta.env.BASE_URL,
        registration = await navigator.serviceWorker.register(
          workerUrl(base, buildVersion(import.meta.url)),
          { scope: base },
        ),
        // The newest worker: after a deploy that is the one still installing,
        // and it is the one whose cache must receive this page's files.
        worker =
          registration.installing ??
          registration.waiting ??
          registration.active;
      if (!worker) return;
      await activated(worker);
      // Everything this page loaded before the worker could see it: scripts,
      // styles, fonts, the demo still. The same list, grown, goes out again
      // each time a model becomes ready (see useOfflineCache).
      adoptFetched();
    } catch (error) {
      console.warn("[spectra] offline support is unavailable:", error);
    }
  };
  // After load, so registration never competes with the first model fetch.
  if (document.readyState === "complete") void start();
  else window.addEventListener("load", () => void start(), { once: true });
}
