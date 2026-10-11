/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  drawRoom,
  H,
  IMAGE,
  ROOM,
  ROOM_AREA_MM2,
  SHEET,
  sheetCorners,
  toImage,
  type P,
} from "../fixtures/ruler-room-scene";

// A phone with touch. Every tap on the picture must count: an outline whose
// first corner is right beside a reference corner, and a point just above
// the stage's buttons.
test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

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
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "ruler-room.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      await page.evaluate(drawRoom, {
        w: IMAGE.w,
        h: IMAGE.h,
        H,
        k: 0,
        sheet: SHEET,
        room: ROOM,
      }),
      "base64",
    ),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
}
/** Where a picture pixel is on the screen, with the page scrolled to the top. */
async function onScreen(page: Page, p: P): Promise<P> {
  await page.evaluate(() => scrollTo(0, 0));
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h);
  return {
    x: box.x + (box.width - IMAGE.w * scale) / 2 + p.x * scale,
    y: box.y + (box.height - IMAGE.h * scale) / 2 + p.y * scale,
  };
}
async function tap(page: Page, p: P) {
  const s = await onScreen(page, p);
  await page.touchscreen.tap(s.x, s.y);
}

test("an outline whose first corner is 7 px from a reference corner keeps all four taps and reads the true area", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page);
  const step = page.getByTestId("ruler-step"),
    board = sheetCorners();
  for (const c of board) await tap(page, c);
  await expect(step).toContainText("Tap two points");

  // The room's first corner is 50 mm from the board's: under 8 px here, well
  // inside the 24 px a finger grabs a handle from.
  const first = await onScreen(page, toImage(ROOM[0])),
    corner = await onScreen(page, board[1]),
    apart = Math.hypot(first.x - corner.x, first.y - corner.y);
  test.info().annotations.push({
    type: "measured",
    description: `first outline corner is ${apart.toFixed(1)} CSS px from reference corner 2`,
  });
  expect(apart).toBeLessThan(10);

  await page.getByRole("button", { name: "Area", exact: true }).click();
  await expect(step).toContainText("Tap each point of the outline");
  for (let i = 0; i < 4; i++) {
    await tap(page, toImage(ROOM[i]));
    // Never silent: every tap is a point, and the step line counts it.
    await expect(step).toContainText(`${i + 1} point${i ? "s" : ""} placed`);
  }
  await page.getByRole("button", { name: "Close outline" }).click();
  // The step line says how many corners the closed outline has.
  await expect(step).toContainText("closed with 4 corners");
  const area = page.getByTestId("ruler-area");
  await expect(area).toHaveAttribute("data-mm2", /\d/);
  const mm2 = Number(await area.getAttribute("data-mm2")),
    bar = Number(await area.getAttribute("data-error-mm2"));
  test.info().annotations.push({
    type: "measured",
    description: `area ${(mm2 / 100).toFixed(0)} +- ${(bar / 100).toFixed(0)} cm2 (truth ${ROOM_AREA_MM2 / 100}): ${await area.textContent()}`,
  });
  expect(Math.abs(mm2 - ROOM_AREA_MM2)).toBeLessThanOrEqual(bar);
  // Half the room (a triangle) is what a lost tap used to give.
  expect(mm2).toBeGreaterThan(0.8 * ROOM_AREA_MM2);

  // The reference did not move: a span across the board still reads 800 mm.
  await page.getByRole("button", { name: "Span", exact: true }).click();
  await tap(page, toImage({ x: 200, y: 450 }));
  await tap(page, toImage({ x: 1000, y: 450 }));
  const out = page.getByTestId("ruler-result").first().locator("output");
  await expect(out).toHaveAttribute("data-mm", /\d/);
  const mm = Number(await out.getAttribute("data-mm"));
  expect(Math.abs(mm - 800)).toBeLessThanOrEqual(
    Number(await out.getAttribute("data-error-mm")),
  );
  expect(Math.abs(mm - 800) / 800).toBeLessThan(0.02);
});
