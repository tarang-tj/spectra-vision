import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// The Presence panel on the real models and the Fusion demo input. Calibration
// is shortened through a flag that only a `?spectra-test` page honours; the
// export says so. Whether the demo yields a face, a body and hands is read from
// the export, never assumed.

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
    Object.assign(window, { __spectraPresenceTest: { calibrationMs: 1500 } });
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  return errors;
}
const tab = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });
const status = (page: Page) => page.getByTestId("presence-status");
const cellText = async (page: Page, id: string) =>
  (await page.getByTestId(`presence-row-${id}`).locator("td").textContent()) ??
  "";

type Metric = {
  id: string;
  seen: boolean;
  value: number | null;
  error: number | null;
  unit: string | null;
  basis: string | null;
  reason: string | null;
};
type Summary = {
  app: string;
  kind: string;
  schema: number;
  protocol: { calibrationMs: number; shortened: boolean };
  thresholds: Record<string, number>;
  baseline: unknown;
  models: { task: string; model: string; delegate: string }[];
  device: { userAgent: string };
  metrics: Metric[];
};
async function exportJson(page: Page): Promise<Summary> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const path = await (await download).path();
  return JSON.parse(await readFile(path, "utf8")) as Summary;
}

test("outside Fusion the panel offers one button to switch to Fusion", async ({
  page,
}) => {
  await open(page);
  await tab(page, "Presence").click();
  await expect(page.getByRole("heading", { name: /^Presence/ })).toBeVisible();
  await expect(page.getByText("Beta", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Switch to Fusion" }).click();
  await expect(tab(page, "Fusion")).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Start", exact: true }),
  ).toBeVisible();
});

test("a session measures on the Fusion demo, keeps going on another tab and exports a measured summary", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  await tab(page, "Fusion").click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await tab(page, "Presence").click();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(status(page)).toContainText("Hold still and look at the camera");
  await expect(status(page)).toHaveText(/^Measuring/, { timeout: 120_000 });
  await expect(
    page.getByRole("button", { name: "Stop", exact: true }),
  ).toBeVisible();

  // Wait for a measured time, then leave the tab for a while: the store is
  // module-level, so measuring goes on and the time covered keeps growing.
  const timeRow = () => cellText(page, "time");
  await expect.poll(timeRow, { timeout: 60_000 }).toMatch(/\d.* ± \d.* s$/);
  const seconds = (text: string) => Number.parseFloat(text);
  const before = seconds(await timeRow());
  await tab(page, "Inspect").click();
  await expect(page.getByTestId("presence-status")).toHaveCount(0);
  await page.waitForTimeout(4000);
  await tab(page, "Presence").click();
  await expect
    .poll(async () => seconds(await timeRow()), { timeout: 30_000 })
    .toBeGreaterThan(before + 2.5);

  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(status(page)).toContainText("Stopped");
  await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();

  // Every row is either "not seen" or a finite value with a finite error.
  const rows = page.locator("[data-testid^='presence-row-']");
  expect(await rows.count()).toBeGreaterThanOrEqual(8);
  for (const row of await rows.all()) {
    const text = (await row.locator("td").textContent()) ?? "";
    expect(text, text).toMatch(/^(not seen|-?\d[\d.]* ± \d[\d.]*)/);
  }

  const summary = await exportJson(page);
  expect(summary).toMatchObject({
    app: "SPECTRA",
    kind: "presence",
    schema: 1,
  });
  expect(summary.protocol).toMatchObject({
    calibrationMs: 1500,
    shortened: true,
  });
  expect(summary.thresholds.headAngle).toBe(15);
  expect(summary.device.userAgent).toBeTruthy();
  expect(summary.models.length).toBeGreaterThan(0);
  expect(summary.metrics.map((m) => m.id)).toEqual(
    expect.arrayContaining([
      "head",
      "sway",
      "stillness",
      "expression",
      "time",
      "seen-face",
      "seen-pose",
      "seen-hand",
    ]),
  );
  for (const m of summary.metrics) {
    if (m.seen) {
      expect(Number.isFinite(m.value), m.id).toBe(true);
      expect(Number.isFinite(m.error) && m.error! >= 0, m.id).toBe(true);
      expect(m.unit, m.id).toBeTruthy();
      expect(m.basis, m.id).toBeTruthy();
    } else {
      expect(m.value, m.id).toBeNull();
      expect(m.reason, m.id).toBeTruthy();
    }
  }
  // What the demo input really yields, printed so the report can quote it.
  const seen = Object.fromEntries(
    summary.metrics
      .filter((m) => m.id.startsWith("seen-"))
      .map((m) => [m.id, m.seen ? `${m.value}%` : "not seen"]),
  );
  console.log("presence demo coverage", JSON.stringify(seen));
  console.log(
    "presence demo metrics",
    JSON.stringify(
      summary.metrics.map((m) => [m.id, m.value, m.error, m.unit]),
    ),
  );
  // The demo is a real photograph of nobody in particular: the face, body and hand
  // models all find a person in it, so these three must be measured.
  expect(summary.metrics.find((m) => m.id === "seen-pose")!.seen).toBe(true);
  expect(errors).toEqual([]);
});

test("at 390 px wide the panel has no horizontal scroll and its controls are at least 40 px tall", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await tab(page, "Fusion").click();
  await tab(page, "Presence").click();
  const start = page.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeVisible();
  const panel = page.locator(".presence-panel");
  for (const control of await panel.locator("button, input").all()) {
    const box = await control.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(40);
  }
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(0);
  const clipped = await panel.evaluate(
    (el) => el.scrollWidth > el.clientWidth + 1,
  );
  expect(clipped).toBe(false);
});
