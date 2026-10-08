/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved.
 *
 * SPECTRA service worker: lets the studio open offline. It caches only what
 * the page has actually fetched from this site. Nothing is uploaded and
 * nothing is fetched ahead of use: a model enters the cache the first time a
 * mode asks for it, never before.
 *
 * Cache rules
 *   navigation        network first, cached copy only when the network fails,
 *                     so a reload after a deploy never shows an old shell
 *   assets/*          cache first (file names carry a content hash)
 *   models/, runtime/ cache first, kept across deploys; a cached file is
 *                     checked against the server in the background and
 *                     dropped if its size changed
 *   other files       network first with a cached fallback (worker script,
 *                     icons, manifest, demo stills)
 *   video, Range      never cached
 */

// The page registers this file as sw.js?v=<hash of its entry script>, so each
// deploy that changes the app gets its own shell cache.
const VERSION = new URL(self.location.href).searchParams.get("v") || "0";
const SHELL = `spectra-shell-${VERSION}`;
// Models and the MediaPipe runtime are large and rarely change: one cache,
// shared by every deploy. Bump the suffix to force everything to be refetched.
const ASSETS = "spectra-assets-v1";
// The folder this file is served from: "/" or "/spectra-vision/".
const SCOPE = new URL("./", self.location.href).href;

self.addEventListener("install", (event) => {
  // Only the page itself is stored at install. Hashed assets are added as the
  // page reports them (see "adopt"), models as modes load them.
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.add(new Request(SCOPE, { cache: "reload" })))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

const shellOf = (worker) =>
  `spectra-shell-${new URL(worker.scriptURL).searchParams.get("v") || "0"}`;

/** Delete every SPECTRA cache that belongs to no worker of this registration.
 * A newer worker that is still installing or waiting keeps its cache: the
 * worker it is about to replace must not delete it. */
const purge = () => {
  const { installing, waiting, active } = self.registration,
    keep = new Set([SHELL, ASSETS]);
  for (const worker of [installing, waiting, active])
    if (worker) keep.add(shellOf(worker));
  return caches
    .keys()
    .then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith("spectra-") && !keep.has(name))
          .map((name) => caches.delete(name)),
      ),
    )
    .catch(() => {});
};

self.addEventListener("activate", (event) => {
  // Active now: the worker this one replaced is no longer in the registration,
  // so its shell cache goes.
  event.waitUntil(purge().then(() => self.clients.claim()));
});

/** "models", "assets", "other", or null for anything this worker leaves alone. */
function classify(url) {
  if (!url.href.startsWith(SCOPE)) return null;
  const path = url.href.slice(SCOPE.length).split(/[?#]/)[0];
  if (/\.(mp4|webm|mov|m4v)$/i.test(path)) return null;
  if (path.startsWith("models/") || path.startsWith("runtime/"))
    return "models";
  if (path.startsWith("assets/")) return "assets";
  return "other";
}

// Every file here is the same for every visitor, whatever request headers a
// server lists under Vary. Some do list one (the preview server sends
// "Vary: Origin"), and a page's own script and style requests then missed the
// copies stored for them, so the offline page came up blank. Match by address.
const ANY = { ignoreVary: true };

const cacheable = (response) =>
  response && response.status === 200 && response.type === "basic";

async function store(cacheName, request, response) {
  if (!cacheable(response)) return;
  try {
    // The body is read in full before it is handed to the cache. Putting
    // the network stream itself stalled for files over about 8 MB (the wasm
    // runtime, the segmenter) in Chrome with no DevTools attached, and a
    // stalled put blocks every later cache operation of the site.
    const body = await response.blob(),
      cache = await caches.open(cacheName);
    await cache.put(
      request,
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      }),
    );
  } catch {
    /* Quota exceeded or storage blocked: the app still works online. */
  }
}

async function cacheFirst(cacheName, request, revalidate) {
  const cache = await caches.open(cacheName),
    hit = await cache.match(request, ANY);
  if (hit) {
    if (revalidate) void dropIfChanged(cache, request, hit);
    return hit;
  }
  const response = await fetch(request);
  void store(cacheName, request, response.clone());
  return response;
}

/** Compare a cached file's size with the server's. A file of another size is
 * removed so the next load fetches it; offline nothing happens. Only the size
 * is compared: a static host stamps ETag and Last-Modified with the deploy
 * time (GitHub Pages does), so they change on every deploy for files whose
 * bytes did not, and comparing them would empty this cache each time. A model
 * replaced by one of exactly the same size needs the ASSETS suffix bumped. */
async function dropIfChanged(cache, request, hit) {
  try {
    const head = await fetch(request.url, {
      method: "HEAD",
      cache: "no-store",
    });
    if (!head.ok) return;
    const before = hit.headers.get("content-length"),
      now = head.headers.get("content-length");
    if (before !== null && now !== null && before !== now)
      await cache.delete(request, ANY);
  } catch {
    /* Offline: keep what we have. */
  }
}

async function networkFirst(request, fallbackToShell) {
  try {
    const response = await fetch(request);
    void store(SHELL, request, response.clone());
    return response;
  } catch (error) {
    const cache = await caches.open(SHELL),
      hit =
        (await cache.match(request, ANY)) ||
        (fallbackToShell ? await cache.match(SCOPE, ANY) : undefined);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  const url = new URL(request.url),
    kind = classify(url);
  if (!kind) return;
  if (request.mode === "navigate") {
    // Only the app's own page falls back to the cached shell.
    const isApp = url.href.split(/[?#]/)[0] === SCOPE;
    event.respondWith(networkFirst(request, isApp));
  } else if (kind === "models")
    event.respondWith(cacheFirst(ASSETS, request, true));
  else if (kind === "assets")
    event.respondWith(cacheFirst(SHELL, request, false));
  else event.respondWith(networkFirst(request, false));
});

// On a first visit the page and its first model load before this worker takes
// control. The page then lists what it already fetched and it is stored here,
// so offline works after one visit. Only URLs the page really requested are
// sent; this is not a precache list.
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "adopt" || !Array.isArray(data.urls)) return;
  // A request the previous version was still answering when this one took
  // over can leave its cache behind: sweep again on every page load.
  event.waitUntil(purge());
  event.waitUntil(
    Promise.all(
      data.urls.map(async (href) => {
        try {
          const url = new URL(href, SCOPE),
            kind = classify(url);
          if (!kind) return;
          const name = kind === "models" ? ASSETS : SHELL,
            cache = await caches.open(name);
          if (await cache.match(url.href, ANY)) return;
          await store(name, url.href, await fetch(url.href));
        } catch {
          /* One file failing must not stop the others. */
        }
      }),
    ),
  );
});
