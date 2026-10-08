/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** The content hash in a built script's file name ("index-B4x9kQ2p.js"), or
 * "0" when there is none. It changes with every deploy that changes the app,
 * which is what gives each deploy its own shell cache. */
export function buildVersion(scriptUrl: string): string {
  return /-([A-Za-z0-9_-]{6,})\.js(?:$|[?#])/.exec(scriptUrl)?.[1] ?? "0";
}

/** Address of the service worker for a base path ("/" or "/spectra-vision/"). */
export function workerUrl(base: string, version: string): string {
  return `${base}sw.js?v=${encodeURIComponent(version)}`;
}

/** Ask the service worker to keep files this page has already fetched. A
 * no-op in development and wherever service workers are unavailable. */
export function adoptFetched(urls: readonly string[]): void {
  if (!import.meta.env.PROD || !urls.length) return;
  try {
    void navigator.serviceWorker?.ready
      .then((registration) =>
        registration.active?.postMessage({ type: "adopt", urls }),
      )
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
 * serve stale modules and fight hot reload. Failure is silent by design, the
 * studio works the same without it. */
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
      // styles, fonts, the demo still. Model files are reported by the app as
      // each mode becomes ready.
      const fetched = performance
        .getEntriesByType("resource")
        .map((entry) => entry.name)
        .filter((name) => name.startsWith(location.origin));
      worker.postMessage({
        type: "adopt",
        urls: [location.href.split(/[?#]/)[0], ...fetched],
      });
    } catch (error) {
      console.warn("[spectra] offline support is unavailable:", error);
    }
  };
  // After load, so registration never competes with the first model fetch.
  if (document.readyState === "complete") void start();
  else window.addEventListener("load", () => void start(), { once: true });
}
