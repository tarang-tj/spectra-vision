/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  drawAccuracyRoom,
  LETTER,
  rectangle,
  SHEET_1,
  SHOT,
  shoot,
  SPANS,
  SPAN_MM,
} from "../fixtures/ruler-accuracy-scene";
import {
  drawRoom,
  H,
  IMAGE,
  ROOM,
  SHEET,
  sheetCorners,
  toImage,
  type P,
} from "../fixtures/ruler-room-scene";

// A phone with touch. A tap places a point while something is part built, even
// right beside a handle: a small sheet can be tapped corner by corner, and an
// outline can pass close to the reference without bending it.
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
}
async function upload(page: Page, name: string, png: string) {
  await page.getByLabel("Upload image or video").setInputFiles({
    name,
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}
/** Where a picture pixel is on the screen, and the CSS pixels per pixel. */
async function onScreen(page: Page, size: { w: number; h: number }) {
  await page.evaluate(() => scrollTo(0, 0));
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / size.w, box.height / size.h);
  return {
    scale,
    at: (p: P): P => ({
      x: box.x + (box.width - size.w * scale) / 2 + p.x * scale,
      y: box.y + (box.height - size.h * scale) / 2 + p.y * scale,
    }),
  };
}

test("a US Letter sheet 40 by 21 px is tapped corner by corner, then a span", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page);
  const sheet = rectangle(SHEET_1, LETTER.long, LETTER.short);
  await upload(
    page,
    "small-sheet.png",
    await page.evaluate(drawAccuracyRoom, {
      c: SHOT,
      sheets: [sheet],
      lines: [SPANS.near],
    }),
  );
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  const step = page.getByTestId("ruler-step");
  // US Letter is the reference a new visitor gets.
  await expect(step).toContainText("Tap corner 1 of 4 of the US Letter");

  const size = { w: SHOT.w, h: SHOT.h },
    corners = sheet.map((p) => shoot(SHOT, p)),
    view = await onScreen(page, size),
    px = corners.map(view.at),
    side = (i: number) =>
      Math.hypot(px[i].x - px[(i + 1) % 4].x, px[i].y - px[(i + 1) % 4].y),
    sides = [0, 1, 2, 3].map(side);
  test.info().annotations.push({
    type: "measured",
    description: `sheet on screen: ${sides.map((s) => s.toFixed(1)).join(", ")} CSS px`,
  });
  // The hard case: corners closer together than the 24 px touch grab radius.
  expect(Math.max(...sides)).toBeLessThan(48);
  expect(Math.min(...sides)).toBeLessThan(24);

  for (let i = 0; i < 4; i++) {
    await expect(step).toContainText(`Tap corner ${i + 1} of 4`);
    const s = (await onScreen(page, size)).at(corners[i]);
    await page.touchscreen.tap(s.x, s.y);
  }
  await expect(step).toContainText("Tap two points");

  for (const end of SPANS.near) {
    const s = (await onScreen(page, size)).at(shoot(SHOT, end));
    await page.touchscreen.tap(s.x, s.y);
  }
  await expect(step).toContainText("Tap two points");
  const out = page.getByTestId("ruler-result").first().locator("output");
  await expect(out).toHaveAttribute("data-mm", /\d/);
  const mm = Number(await out.getAttribute("data-mm")),
    error = Number(await out.getAttribute("data-error-mm"));
  test.info().annotations.push({
    type: "measured",
    description: `near span ${mm.toFixed(0)} +- ${error.toFixed(0)} mm (truth ${SPAN_MM})`,
  });
  expect(error).toBeGreaterThan(0);
  expect(Math.abs(mm - SPAN_MM)).toBeLessThanOrEqual(error);

  // Controls a finger must hit are at least 40 px in both directions.
  for (const unit of await page
    .getByRole("group", { name: "Units" })
    .getByRole("button")
    .all()) {
    const box = (await unit.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);
  }
  const summary = page.getByText("What this bar covers").first(),
    box = (await summary.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(40);
});

test("outline taps 7 px from reference corners place points and leave the reference alone", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page);
  await upload(
    page,
    "ruler-room.png",
    await page.evaluate(drawRoom, {
      w: IMAGE.w,
      h: IMAGE.h,
      H,
      k: 0,
      sheet: SHEET,
      room: ROOM,
    }),
  );
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
  const step = page.getByTestId("ruler-step"),
    tap = async (p: P, dx = 0, dy = 0) => {
      const s = (await onScreen(page, IMAGE)).at(p);
      await page.touchscreen.tap(s.x + dx, s.y + dy);
    },
    board = sheetCorners();
  for (const c of board) await tap(c);
  await expect(step).toContainText("Tap two points");

  await page.getByRole("button", { name: "Area", exact: true }).click();
  await expect(step).toContainText("Tap each point of the outline");
  // Four outline points; the second and third are 7 px (5 across, 5 down)
  // from two corners of the board, well inside the 24 px touch radius.
  await tap(toImage({ x: 300, y: 1200 }));
  await expect(step).toContainText("1 point placed");
  await tap(board[3], 5, 5);
  await expect(step).toContainText("2 points placed");
  await tap(board[2], 5, 5);
  await expect(step).toContainText("3 points placed");
  await tap(toImage({ x: 1500, y: 1200 }));
  await expect(step).toContainText("4 points placed");
  await page.getByRole("button", { name: "Close outline" }).click();
  await expect(page.getByTestId("ruler-area")).toHaveAttribute(
    "data-mm2",
    /\d/,
  );

  // The reference is where it was: a span of 800 mm across the board still
  // reads 800 mm, with a narrow bar. A corner dragged 7 px would bend it.
  await page.getByRole("button", { name: "Span", exact: true }).click();
  await tap(toImage({ x: 200, y: 450 }));
  await tap(toImage({ x: 1000, y: 450 }));
  const out = page.getByTestId("ruler-result").first().locator("output");
  await expect(out).toHaveAttribute("data-mm", /\d/);
  const mm = Number(await out.getAttribute("data-mm")),
    error = Number(await out.getAttribute("data-error-mm"));
  test.info().annotations.push({
    type: "measured",
    description: `span across the board ${mm.toFixed(1)} +- ${error.toFixed(1)} mm (truth 800)`,
  });
  expect(Math.abs(mm - 800)).toBeLessThanOrEqual(error);
  expect(Math.abs(mm - 800) / 800).toBeLessThan(0.02);

  // A tap on a handle with nothing part built grabs it, moves nothing and
  // says so; the next tap elsewhere places a point as usual.
  await tap(board[1], 4, 3);
  await expect(step).toContainText(
    "took hold of corner 2 of the reference and moved nothing",
  );
  await expect(step).toContainText("tap elsewhere to place a point");
  await expect(page.getByTestId("ruler-result")).toHaveCount(1);
  expect(Number(await out.getAttribute("data-mm"))).toBe(mm);
});
