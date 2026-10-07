import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const production = process.env.SPECTRA_TEST_PRODUCTION === "1";
const localURL = production
  ? "http://127.0.0.1:5173/spectra-vision/"
  : "http://127.0.0.1:5173/";
const localChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  outputDir: join(tmpdir(), "spectra-playwright"),
  use: {
    baseURL: process.env.SPECTRA_TEST_URL || localURL,
    viewport: { width: 1536, height: 1024 },
    launchOptions: {
      executablePath:
        process.env.CHROME_PATH ||
        (existsSync(localChrome) ? localChrome : undefined),
      args: [
        "--disable-gpu",
        "--use-angle=swiftshader",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
      ],
    },
    navigationTimeout: 90_000,
    actionTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: process.env.SPECTRA_TEST_URL
    ? undefined
    : {
        command: production
          ? "PAGES_BUILD=1 pnpm run preview --port 5173"
          : "pnpm run dev --port 5173",
        url: localURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
