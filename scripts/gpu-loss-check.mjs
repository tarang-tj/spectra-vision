/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Manual check, not part of CI (CI has no GPU): open the app in system Chrome
// on the real GPU, end that browser's graphics process, and report whether the
// running task says so and carries on with real results on CPU.
//   node scripts/gpu-loss-check.mjs [url] [mode]
import { execSync } from "node:child_process";
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5173/?spectra-test",
  mode = process.argv[3] ?? "Objects";
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: mode, exact: true }).click();
const tab = (name) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
await tab("Lab").click();
const line = async () =>
  (await page.locator("[data-panel='lab']").innerText())
    .split("\n")
    .filter((l) => /Running on|stopped working|failed earlier/.test(l))
    .join(" | ");
// What the mode is following, read from the Inspect panel's rows.
const found = async () => {
  await tab("Inspect").click();
  await page.waitForTimeout(1500);
  const rows = await page.locator(".detection-row").count(),
    results = await page.evaluate(() => window.__spectraResults?.count ?? 0);
  await tab("Lab").click();
  await page.waitForTimeout(500);
  return { results, rows };
};
await page.waitForFunction(() => (window.__spectraResults?.count ?? 0) > 20, {
  timeout: 120_000,
});
const before = { line: await line(), ...(await found()) };
// Only this automated browser's graphics process: its profile path is unique.
const pids = execSync(
  "pgrep -f 'type=gpu-process.*playwright_chromiumdev_profile' || true",
)
  .toString()
  .trim()
  .split("\n")
  .filter(Boolean);
for (const pid of pids) process.kill(Number(pid), "SIGKILL");
await page.waitForTimeout(12_000);
const after = { line: await line(), ...(await found()) };
console.log(
  JSON.stringify({ mode, killed: pids.length, before, after }, null, 1),
);
const ok =
  /Running on GPU/.test(before.line) &&
  /CPU/.test(after.line) &&
  after.results > before.results &&
  before.rows > 0 &&
  after.rows > 0;
console.log(ok ? "PASS: fell back to CPU and kept finding things" : "FAIL");
await browser.close();
process.exit(ok ? 0 : 1);
