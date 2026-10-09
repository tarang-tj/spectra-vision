/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// The Library tab on the Objects demo: what was seen, the class filter, and
// Finer names. Runs the real detector and the real classifier.
const tab = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
const rows = (page: Page) => page.locator(".detection-row");

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test then deals with what is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  return errors;
}

test("Library counts what Objects saw, filters classes on the stage rows and resets", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  await expect(rows(page).filter({ hasText: "chair" })).toHaveCount(1, {
    timeout: 90_000,
  });
  await tab(page, "Library").click();
  await expect(
    page.getByRole("heading", { name: "Library", level: 2 }),
  ).toBeVisible();
  // Every class the detector can name is listed; the ones in the demo have counts.
  await expect(
    page.locator('.library-list li[data-seen="0"]').first(),
  ).toBeVisible();
  const seen = page.locator('.library-list li:not([data-seen="0"])');
  await expect
    .poll(() => seen.count(), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(2);
  const chair = page.locator(".library-list li").filter({ hasText: /^chair/ });
  await expect(chair).toContainText(/\d+ frames, last/);
  expect(Number(await chair.getAttribute("data-seen"))).toBeGreaterThan(0);
  // Search narrows the list.
  await page.getByLabel("Search classes").fill("chai");
  await expect(page.locator(".library-list li")).toHaveCount(1);
  await page.getByLabel("Search classes").fill("");

  // Hide chair: it leaves the stage rows, the panel says it is filtering, and
  // the other classes stay.
  await expect(page.getByTestId("library-filter")).toHaveText(
    "Showing every class.",
  );
  await page.getByRole("button", { name: "Hide these" }).click();
  await chair.getByRole("checkbox").check();
  await expect(page.getByTestId("library-filter")).toHaveText(
    "Filter on: hiding chair",
  );
  await tab(page, "Inspect").click();
  await expect(rows(page).filter({ hasText: "person" })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "chair" })).toHaveCount(0);

  // One tap puts everything back.
  await tab(page, "Library").click();
  await page.getByRole("button", { name: "Reset filter" }).click();
  await expect(page.getByTestId("library-filter")).toHaveText(
    "Showing every class.",
  );
  await expect(page.getByRole("button", { name: "Reset filter" })).toHaveCount(
    0,
  );
  await tab(page, "Inspect").click();
  await expect(rows(page).filter({ hasText: "chair" })).toHaveCount(1);

  // When the filter hides every box, Inspect says so and offers the reset,
  // instead of claiming nothing was detected.
  await tab(page, "Library").click();
  await page.getByRole("button", { name: "Only these" }).click();
  await page
    .locator(".library-list li")
    .filter({ hasText: /^toaster/ })
    .getByRole("checkbox")
    .check();
  await tab(page, "Inspect").click();
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByTestId("inspect-filter")).toContainText(
    "Filter on: showing only toaster",
  );
  await expect(
    page.getByText("Every box found is hidden by the class filter."),
  ).toBeVisible();
  await expect(page.getByText("Nothing detected yet")).toHaveCount(0);
  await page.getByRole("button", { name: "Reset filter" }).click();
  await expect(page.getByTestId("inspect-filter")).toHaveCount(0);
  await expect(rows(page).filter({ hasText: "chair" })).toHaveCount(1);

  // Only these: just the chosen class.
  await tab(page, "Library").click();
  await page.getByRole("button", { name: "Only these" }).click();
  await chair.getByRole("checkbox").check();
  await tab(page, "Inspect").click();
  await expect(rows(page).filter({ hasText: "chair" })).toHaveCount(1);
  await expect(rows(page).filter({ hasText: "person" })).toHaveCount(0);
  await tab(page, "Library").click();
  await page.getByRole("button", { name: "Reset filter" }).click();
  expect(errors).toEqual([]);
});

test("Finer names is off by default, then adds a classifier name beside the detector's, with its own score", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = await open(page);
  await expect(rows(page).first()).toBeVisible({ timeout: 90_000 });
  await expect(rows(page).filter({ hasText: " · " })).toHaveCount(0);
  await tab(page, "Library").click();
  const finer = page.getByRole("button", { name: "Finer names", exact: true });
  await expect(finer).toHaveAttribute("aria-pressed", "false");
  // Off: no classifier model is fetched and no row has a second name.
  await expect(page.getByText("Turn on Finer names to load")).toBeVisible();
  const fetched = page.waitForResponse(/models\/efficientnet_lite0\.tflite$/, {
    timeout: 120_000,
  });
  await finer.click();
  expect((await fetched).status()).toBe(200);
  const status = page.getByTestId("library-finer");
  await expect(status).toHaveText(
    /Finer names: (\d+ of \d+ boxes in the latest frame have a name|no box in the latest frame has a name) at 30% or more\./,
    { timeout: 120_000 },
  );
  // The classifier's own labels are now listed (1,000 of them).
  await expect(
    page.getByRole("region", { name: "Finer names" }).getByRole("heading"),
  ).toContainText("1000");
  await tab(page, "Inspect").click();
  // A finer name never replaces the detector's: row label stays, detail has both scores.
  const withName = rows(page).filter({ hasText: /\d+% · .+ \d+%/ });
  await expect
    .poll(() => withName.count(), { timeout: 90_000 })
    .toBeGreaterThanOrEqual(1);
  const detail = await withName.first().locator("small").textContent();
  const match = /^(\d+)% · (.+) (\d+)%$/.exec(detail ?? "");
  expect(match).not.toBeNull();
  expect(Number(match![3])).toBeGreaterThanOrEqual(30);
  // The export gains optional keys only: each finer name carries its own score.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export session" }).click();
  const session = JSON.parse(
    await readFile((await (await download).path())!, "utf8"),
  ) as {
    frames: {
      detections: {
        label: string;
        score: number;
        finer?: { label: string; score: number };
      }[];
    }[];
  };
  const named = session.frames
    .flatMap((f) => f.detections)
    .filter((d) => d.finer);
  expect(named.length).toBeGreaterThan(0);
  expect(
    named.every(
      (d) => d.finer!.score >= 0.3 && typeof d.finer!.label === "string",
    ),
  ).toBe(true);
  // Off again: the second names go away.
  await tab(page, "Library").click();
  await finer.click();
  await tab(page, "Inspect").click();
  await expect(withName).toHaveCount(0, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
