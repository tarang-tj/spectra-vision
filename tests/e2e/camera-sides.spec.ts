/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which way a camera faces, where the answer is not simply given: a panel
// that prefers the rear, a camera that never says, and one that says so only
// in its capabilities. The cameras are stand-ins
// (tests/helpers/stand-in-cameras.ts): this shows what the app does with
// such cameras, not what a real phone hands it.
import { test, expect, type Page } from "@playwright/test";
import {
  CAPABLE,
  UNSIDED,
  bench,
  picture,
  standInCameras,
} from "../helpers/stand-in-cameras";

declare global {
  interface Window {
    standIn: import("../helpers/stand-in-cameras").Bench;
  }
}

const UNKNOWN_SIDE =
  "This camera does not say which way it faces, so it is shown mirrored. Press Mirror if it points away from you.";

const open = async (page: Page) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(badge(page)).toHaveText("DEMO IMAGE");
};
const start = (page: Page) =>
  page.getByRole("button", { name: "Start camera" }).click();
const badge = (page: Page) => page.locator(".hud-badge").first();
const side = (page: Page, name: "Front" | "Rear") =>
  page.getByRole("group", { name: "Camera" }).getByRole("button", { name });
const mirror = (page: Page) =>
  page.getByRole("button", { name: "Mirror", exact: true });
const toast = (page: Page) => page.locator(".toast");
const red = (page: Page) => async () => (await picture(page)).red;
const lastAsked = (page: Page) => bench(page, (b) => b.calls.at(-1)!.video);
/** Open the Ruler and wait for its own controls: the panel may load on
 * demand, and its preference for the rear camera is set when it is shown. */
const openRuler = async (page: Page) => {
  await page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name: "Ruler", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Custom", exact: true }),
  ).toBeVisible();
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("with the Ruler open, Start camera asks for the rear camera and gets it", async ({
  page,
}) => {
  await standInCameras(page);
  await open(page);
  await expect(side(page, "Front")).toHaveAttribute("aria-pressed", "true");
  await openRuler(page);
  await expect(side(page, "Rear")).toHaveAttribute("aria-pressed", "true");
  await start(page);
  await expect(badge(page)).toContainText("CAMERA · REAR");
  expect(await lastAsked(page)).toMatchObject({
    facingMode: { ideal: "environment" },
  });
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(red(page)).toBe("left");
});

test("a camera that does not say which way it faces is mirrored with a word about it, and no side is shown as chosen for it", async ({
  page,
}) => {
  await standInCameras(page, [UNSIDED]);
  await open(page);
  await start(page);
  await expect(toast(page)).toHaveText(UNKNOWN_SIDE);
  // No side in the badge: it is not known.
  await expect(badge(page)).toHaveText("CAMERA · 720×1280");
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "true");
  await expect.poll(red(page)).toBe("right");
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect(badge(page)).toHaveText("DEMO IMAGE");
  await expect(toast(page)).toHaveCount(0, { timeout: 10_000 });
  // It is now the remembered camera. The Ruler prefers the rear, but Start
  // camera will open this one, and which side that is nobody knows.
  await openRuler(page);
  await expect(side(page, "Rear")).toHaveAttribute("aria-pressed", "false");
  await expect(side(page, "Front")).toHaveAttribute("aria-pressed", "false");
  await start(page);
  await expect(toast(page)).toHaveText(UNKNOWN_SIDE);
  expect(await lastAsked(page)).toMatchObject({
    deviceId: { exact: "unsided-id" },
  });
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "true");
});

test("a side given only by the camera's capabilities is believed", async ({
  page,
}) => {
  await standInCameras(page, [CAPABLE]);
  await open(page);
  await start(page);
  await expect(badge(page)).toHaveText("CAMERA · REAR · 720×1280");
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(red(page)).toBe("left");
  await expect(toast(page)).toHaveCount(0);
});
