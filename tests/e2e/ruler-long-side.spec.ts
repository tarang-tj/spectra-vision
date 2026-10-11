/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  boardCorners,
  cameraFor,
  drawRoomView,
  MARKS,
  type P,
} from "../fixtures/room-scene";

// The room fixture's second camera looks along the board's 1000 mm side, so
// that side looks the shorter one in its picture. The wall from (0, 0) to
// (0, 3100) is 3.100 m.
const IMAGE = { w: 1600, h: 1200 },
  CAM = 1,
  cam = cameraFor(CAM, IMAGE.w, IMAGE.h),
  on = (p: P) => cam.shoot(p.x, p.y),
  WALL_MM = 3100;

async function tap(page: Page, p: P) {
  await page.locator(".camera-stage canvas").scrollIntoViewIfNeeded();
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h);
  await page.mouse.click(
    box.x + (box.width - IMAGE.w * scale) / 2 + p.x * scale,
    box.y + (box.height - IMAGE.h * scale) / 2 + p.y * scale,
  );
}

test("a picture taken along the reference's long side reads a 3.100 m wall right with no Swap, and says how it chose", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  const corners = boardCorners(),
    png = await page.evaluate(drawRoomView, {
      ...IMAGE,
      floor: cam.floorSeen(),
      board: corners.map(on),
      marks: MARKS.map(on),
      tick: on({ x: corners[0].x + 60, y: corners[0].y - 60 }),
      name: `camera ${CAM + 1}`,
    });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "room-2.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await page
    .getByRole("group", { name: "Units", exact: true })
    .getByRole("button", { name: "m", exact: true })
    .click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
  const step = page.getByTestId("ruler-step"),
    [c0, c1, c2, c3] = corners.map(on);
  await expect(step).toContainText("Tap corner 1 of 4");
  for (const c of [c2, c0, c3, c1]) await tap(page, c);
  await expect(step).toContainText("Tap two points");

  await tap(page, on({ x: 0, y: 0 }));
  await tap(page, on({ x: 0, y: WALL_MM }));
  const out = page.getByTestId("ruler-result").locator("output");
  await expect(out).toHaveText(/^[\d.]+ ± [\d.]+ m$/);
  const mm = Number(await out.getAttribute("data-mm")),
    bar = Number(await out.getAttribute("data-error-mm"));
  test.info().annotations.push({
    type: "measured",
    description: `wall, truth ${WALL_MM} mm: ${mm.toFixed(0)} +- ${bar.toFixed(0)} mm (${await out.textContent()})`,
  });
  expect(Math.abs(mm - WALL_MM)).toBeLessThanOrEqual(bar);
  const swap = page.getByRole("button", { name: "Swap sides", exact: true }),
    note = page.getByTestId("ruler-long-side");
  await expect(swap).toHaveAttribute("aria-pressed", "false");
  // The picture overruled how the sheet looks, and the panel says so.
  await expect(note).toHaveAttribute("data-how", "picture");
  await expect(note).toContainText("looks shorter here");

  // Swap still flips the sides. The user's choice is kept and questioned.
  await swap.click();
  await expect(note).toContainText("the picture disagrees");
  await expect(out).toHaveText(/^[\d.]+ ± [\d.]+ m$/);
  const swapped = Number(await out.getAttribute("data-mm"));
  expect(Math.abs(swapped - WALL_MM)).toBeGreaterThan(1000);
});
