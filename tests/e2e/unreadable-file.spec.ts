/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  drawRoom,
  H,
  IMAGE,
  ROOM,
  SHEET,
  sheetCorners,
} from "../fixtures/ruler-room-scene";

// A file that is not a picture must leave the stage as it was: the picture
// that was showing, its taps, and a notice saying the file was not read.
const NOTICE =
  "That file could not be read as a picture. The stage is unchanged.";
const BROKEN = {
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not really a png"),
  },
  TEXT = {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  };

async function open(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
}
const goodPng = async (page: Page) =>
  Buffer.from(
    await page.evaluate(drawRoom, {
      w: IMAGE.w,
      h: IMAGE.h,
      H,
      k: 0,
      sheet: SHEET,
      room: ROOM,
    }),
    "base64",
  );
/** The stage shows `name` as a still picture and no error message. */
async function showsPicture(page: Page, name: string) {
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await expect(page.locator(".playback > span")).toContainText(name);
  await expect(page.locator(".stage-message")).toHaveCount(0);
}

test("a damaged image and a text file given to Upload leave the picture and its taps, with a notice", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await open(page);
  const upload = page.getByLabel("Upload image or video"),
    step = page.getByTestId("ruler-step"),
    toast = page.locator(".toast");
  await upload.setInputFiles({
    name: "ruler-room.png",
    mimeType: "image/png",
    buffer: await goodPng(page),
  });
  await showsPicture(page, "ruler-room.png");
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  // The Ruler's body is fetched on demand: it takes taps once it is showing.
  await expect(step).toContainText("Tap corner 1 of 4");
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h),
    corner = sheetCorners()[0];
  await page.mouse.click(
    box.x + (box.width - IMAGE.w * scale) / 2 + corner.x * scale,
    box.y + (box.height - IMAGE.h * scale) / 2 + corner.y * scale,
  );
  await expect(step).toContainText("Tap corner 2 of 4");

  for (const bad of [BROKEN, TEXT]) {
    await upload.setInputFiles(bad);
    await expect(toast).toHaveText(NOTICE);
    await showsPicture(page, "ruler-room.png");
    // The tap is still there: the picture was never taken off the stage.
    await expect(step).toContainText("Tap corner 2 of 4");
    await expect(toast).toHaveCount(0, { timeout: 15_000 });
  }

  // A good picture still opens afterwards.
  await upload.setInputFiles({
    name: "second.png",
    mimeType: "image/png",
    buffer: await goodPng(page),
  });
  await showsPicture(page, "second.png");
  await expect(step).toContainText("Tap corner 1 of 4");
});

test("a damaged image given to Add picture leaves the room's picture on the stage", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await open(page);
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  const add = page.getByLabel("Add a picture of this room");
  await add.setInputFiles({
    name: "room-1.png",
    mimeType: "image/png",
    buffer: await goodPng(page),
  });
  await expect(page.getByTestId("room-status")).toHaveText(
    "1 picture in this room.",
  );
  await showsPicture(page, "room-1.png");

  await add.setInputFiles(BROKEN);
  await expect(page.locator(".toast")).toHaveText(NOTICE);
  await expect(page.getByTestId("room-status")).toContainText(
    "could not be opened",
  );
  await showsPicture(page, "room-1.png");
});
