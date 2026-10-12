import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";

/** Offline after one visit: the service worker stores the scripts and styles
 * the built page names (public/sw.js, `precacheShell`). A panel fetched on
 * demand is in none of the page's own tags, so every script and stylesheet of
 * the bundle that the page does not name yet is added as a prefetch link. */
function prefetchChunks(): Plugin {
  let base = "/";
  return {
    name: "spectra-prefetch-chunks",
    apply: "build",
    configResolved(config) {
      base = config.base;
    },
    transformIndexHtml: {
      order: "post",
      handler: (html, { bundle }) =>
        Object.keys(bundle ?? {})
          .filter((file) => /\.(js|css)$/.test(file) && !html.includes(file))
          .sort()
          .map((file) => ({
            tag: "link",
            attrs: { rel: "prefetch", href: base + file },
            injectTo: "head" as const,
          })),
    },
  };
}

export default defineConfig({
  plugins: [react(), prefetchChunks()],
  base: process.env.PAGES_BUILD ? "/spectra-vision/" : "/",
  // The simulation tests run hundreds of seeded retakes; on a busy machine a
  // sub-second test has taken over the 5 s default while they hold the cores.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20_000 },
  build: { chunkSizeWarningLimit: 550 },
});
