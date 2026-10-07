import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  base: process.env.PAGES_BUILD ? "/spectra-vision/" : "/",
  test: { include: ["tests/**/*.test.ts"] },
  build: { chunkSizeWarningLimit: 650 },
});
