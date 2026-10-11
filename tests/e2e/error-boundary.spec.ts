/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// A panel that throws while rendering must take down that panel only. No
// shipped panel has an input known to make it throw, so the boundary's test
// hook (window.__spectraFault, only with ?spectra-test) stands in a part that
// throws: the real boundary, the real rail and the real stage do the rest.
type Faulted = { __spectraFault?: string };
const tab = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
const fault = (page: Page, name?: string) =>
  page.evaluate((value) => {
    (window as Faulted).__spectraFault = value;
  }, name);
const latency = (page: Page) => page.getByTestId("latency");

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^INFO: /.test(message.text()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test then deals with what is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(latency(page)).toHaveText(/^\d+ ms$/);
  return errors;
}

test("a panel that throws shows a message in its own place, is logged once, and the stage and the other panels go on", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page),
    alert = page.getByTestId("panel-fault");
  await fault(page, "The Ruler panel");
  await tab(page, "Ruler").click();
  await expect(alert).toHaveText(
    /The Ruler panel stopped on an error\. The stage and the rest of the app still work\./,
  );
  await expect(alert).toHaveAttribute("role", "alert");
  // Inside the rail's panel body, not instead of the app.
  await expect(
    page.locator(".panel-body").getByTestId("panel-fault"),
  ).toHaveCount(1);
  await expect(page.locator(".camera-stage canvas")).toBeVisible();
  await expect(tab(page, "Ruler")).toHaveAttribute("aria-pressed", "true");
  // The stage still runs the model: results keep arriving.
  const results = () =>
    page.evaluate(
      () =>
        (window as { __spectraResults?: { count: number } }).__spectraResults!
          .count,
    );
  const before = await results();
  await expect.poll(results, { timeout: 60_000 }).toBeGreaterThan(before);
  await expect(latency(page)).toHaveText(/^\d+ ms$/);
  // Logged once, with the name of what failed.
  expect(errors.filter((e) => e.includes("failed to render"))).toHaveLength(1);
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("[spectra] The Ruler panel failed to render:");

  // Another panel is not affected, and coming back starts clean.
  await tab(page, "Lab").click();
  await expect(alert).toHaveCount(0);
  await expect(page.locator('.panel-body[data-panel="lab"]')).not.toBeEmpty();
  await tab(page, "Ruler").click();
  await expect(alert).toHaveCount(1);
  expect(errors).toHaveLength(2);

  // "Try again" renders the panel again: still failing, the message stays;
  // once the cause is gone, the panel is back.
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(alert).toHaveCount(1);
  expect(errors).toHaveLength(3);
  await fault(page, undefined);
  await page.getByRole("button", { name: "Try again" }).focus();
  await page.keyboard.press("Enter");
  await expect(alert).toHaveCount(0);
  await expect(page.locator(".ruler-panel")).toBeVisible();
  expect(errors).toHaveLength(3);
});

test("a mode's own settings that throw leave the rest of the Inspect panel in place", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page),
    alert = page.getByTestId("panel-fault");
  await fault(page, "The Objects settings");
  // Any state change renders the panel again; the frame list is one.
  await tab(page, "Lab").click();
  await tab(page, "Inspect").click();
  await expect(alert).toHaveText(/The Objects settings stopped on an error\./);
  await expect(
    page.getByRole("heading", { name: /In the frame/, level: 2 }),
  ).toBeVisible();
  await expect(page.locator("#confidence")).toBeVisible();
  await expect(page.locator(".camera-stage canvas")).toBeVisible();
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain(
    "[spectra] The Objects settings failed to render:",
  );
  await fault(page, undefined);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(alert).toHaveCount(0);
});
