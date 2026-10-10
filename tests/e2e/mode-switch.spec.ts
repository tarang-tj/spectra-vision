/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// The seam between modes: what happens when the mode changes under a live
// result, or while models are still loading.

/** Console errors and page errors. MediaPipe writes its own "INFO:" start-up
 * lines to console.error from the worker; those are not errors. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^INFO: /.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}
async function ready(page: Page) {
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
const switcher = (page: Page) =>
  page.getByRole("navigation", { name: "Vision mode" });

test("every adjacent pair of modes switches both ways without an error", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem("spectra.coach.v1", "1"));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const names = await switcher(page).getByRole("button").allInnerTexts();
  expect(names).toHaveLength(8);
  const go = async (name: string) => {
    await switcher(page).getByRole("button", { name, exact: true }).click();
    await expect(
      switcher(page).getByRole("button", { name, exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  };
  // Forward then back. Each mode is left the moment it has a live result on
  // the stage and in the inspector, which is when a result made for one mode
  // could reach the next one.
  const order = [...names.slice(1), ...names.slice(0, -1).reverse()];
  for (const name of order) {
    await go(name);
    await ready(page);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  // The same walk with no waiting at all: models are still loading when the
  // mode changes again.
  for (const name of order) await go(name);
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Reality, augmented.",
  );
  // One mode is left, so one worker is.
  await expect.poll(() => page.workers().length).toBe(1);
  expect(errors).toEqual([]);
});
