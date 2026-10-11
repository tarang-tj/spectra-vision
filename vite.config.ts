import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BUILD ? "/spectra-vision/" : "/",
  // The simulation tests run hundreds of seeded retakes; on a busy machine a
  // sub-second test has taken over the 5 s default while they hold the cores.
  test: { include: ["tests/**/*.test.ts"], testTimeout: 20_000 },
  build: { chunkSizeWarningLimit: 650 },
});
