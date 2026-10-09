/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type CDPSession, type Page } from "@playwright/test";
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

// A phone-sized screen with touch input. Touch is driven two ways: Playwright's
// tap (a real touch pointer) and raw touch points through the DevTools
// protocol for drags and swipes, which Playwright has no call for.
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
async function loadRoom(page: Page) {
  const png = await page.evaluate(drawRoom, {
    w: IMAGE.w,
    h: IMAGE.h,
    H,
    k: 0,
    sheet: SHEET,
    room: ROOM,
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "ruler-room.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}
async function screenOf(page: Page, p: P) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h);
  return {
    x: box.x + (box.width - IMAGE.w * scale) / 2 + p.x * scale,
    y: box.y + (box.height - IMAGE.h * scale) / 2 + p.y * scale,
  };
}
/** Bring the picture to the top of the screen, as a person would to tap it. */
const toTop = (page: Page) => page.evaluate(() => scrollTo(0, 0));
async function touchTap(page: Page, p: P) {
  await toTop(page);
  const s = await screenOf(page, p);
  await page.touchscreen.tap(s.x, s.y);
}
const point = (x: number, y: number) => ({ x, y, id: 1 });
async function touch(
  cdp: CDPSession,
  type: "touchStart" | "touchMove" | "touchEnd",
  at?: { x: number; y: number },
) {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: at && type !== "touchEnd" ? [point(at.x, at.y)] : [],
  });
}
/** Colour of the ruler's lines and loupe ring, counted on the stage canvas. */
const lit = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(
        ".camera-stage canvas",
      )!,
      d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4)
      if (d[i] === 164 && d[i + 1] === 255 && d[i + 2] === 217) n++;
    return n;
  });
async function readyRuler(page: Page) {
  await open(page);
  await loadRoom(page);
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
}

test("placing, dragging and the loupe work with a finger", async ({ page }) => {
  test.setTimeout(300_000);
  await readyRuler(page);
  const step = page.getByTestId("ruler-step");
  // The panel sits below the picture on a phone; bring the picture into view.
  await expect(step).toContainText("Tap corner 1");
  const [c0, c1, c2, c3] = sheetCorners();
  for (const c of [c0, c1, c2, c3]) await touchTap(page, c);
  await expect(step).toContainText("Tap two points");

  // Two taps place a span; a value appears.
  const a = toImage({ x: 550, y: 400 }),
    b = toImage({ x: 1700, y: 500 });
  await touchTap(page, a);
  await touchTap(page, b);
  const out = page.getByTestId("ruler-result").first().locator("output");
  await expect(out).toHaveAttribute("data-mm", /\d/);
  const before = Number(await out.getAttribute("data-mm"));
  expect(before).toBeGreaterThan(0);

  // Drag the end by a finger: the loupe shows during the drag and goes after.
  const cdp = await page.context().newCDPSession(page),
    idle = await lit(page),
    from = await screenOf(page, b),
    to = { x: from.x + 14, y: from.y - 12 };
  await touch(cdp, "touchStart", from);
  for (let i = 1; i <= 6; i++)
    await touch(cdp, "touchMove", {
      x: from.x + ((to.x - from.x) * i) / 6,
      y: from.y + ((to.y - from.y) * i) / 6,
    });
  await expect.poll(() => lit(page)).toBeGreaterThan(idle + 150);
  await touch(cdp, "touchEnd");
  await expect.poll(() => lit(page)).toBeLessThan(idle + 60);
  await expect
    .poll(async () => Number(await out.getAttribute("data-mm")))
    .not.toBe(before);
  // The dragged end moved, it was not replaced: still one measurement.
  await expect(page.getByTestId("ruler-result")).toHaveCount(1);

  // A second finger down during a drag is ignored: no point is replaced or
  // added, and the first finger's release still ends the drag.
  const settled = await out.getAttribute("data-mm"),
    one = await screenOf(page, a),
    two = await screenOf(page, toImage({ x: 2000, y: 700 }));
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(one.x, one.y), { x: two.x, y: two.y, id: 2 }],
  });
  await touch(cdp, "touchEnd");
  await expect(page.getByTestId("ruler-result")).toHaveCount(1);
  // No half-placed span is waiting for its other end.
  await expect(step).toContainText("Tap two points");
  expect(await out.getAttribute("data-mm")).toBe(settled);
});

test("the page still scrolls by touch while the Ruler tab is open", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await readyRuler(page);
  const canvas = page.locator(".camera-stage canvas");
  // A still photo is being measured: the canvas takes touches, the rest of the
  // page must still scroll under a swipe.
  await expect(canvas).toHaveAttribute("data-pointer", "on");
  const cdp = await page.context().newCDPSession(page);
  await toTop(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  const swipe = async (x: number, y0: number, y1: number) => {
    await touch(cdp, "touchStart", { x, y: y0 });
    for (let i = 1; i <= 10; i++)
      await touch(cdp, "touchMove", { x, y: y0 + ((y1 - y0) * i) / 10 });
    await touch(cdp, "touchEnd");
  };
  await swipe(195, 780, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  await page.evaluate(() => scrollTo(0, 0));

  // The canvas keeps a swipe to itself only while a still picture is measured.
  await expect(canvas).toHaveCSS("touch-action", "none");
});

test("with a live camera the canvas lets a swipe scroll the page", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  const canvas = page.locator(".camera-stage canvas");
  // Live picture: nothing is listening for taps, so touch-action is not none.
  await expect(canvas).not.toHaveAttribute("data-pointer", "on");
  await expect(canvas).not.toHaveCSS("touch-action", "none");
  const cdp = await page.context().newCDPSession(page),
    box = (await canvas.boundingBox())!,
    x = box.x + box.width / 2,
    y0 = box.y + box.height - 20;
  await touch(cdp, "touchStart", { x, y: y0 });
  for (let i = 1; i <= 10; i++)
    await touch(cdp, "touchMove", { x, y: y0 - i * 15 });
  await touch(cdp, "touchEnd");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(50);

  // Freezing makes the canvas take touches again.
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(canvas).toHaveAttribute("data-pointer", "on");
});

test("the stage's own resume button drops values at once", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(page.getByTestId("ruler-step")).toContainText("Tap corner 1");
  const at = async (fx: number, fy: number) => {
    await toTop(page);
    const box = (await page.locator(".camera-stage canvas").boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
  };
  for (const [fx, fy] of [
    [0.4, 0.35],
    [0.6, 0.35],
    [0.6, 0.65],
    [0.4, 0.65],
    [0.45, 0.45],
    [0.55, 0.55],
  ])
    await at(fx, fy);
  await expect(page.getByTestId("ruler-result")).toHaveCount(1);
  // The stage's play button, not the panel's: values go and stay gone.
  await page.getByRole("button", { name: "Resume detection" }).click();
  await expect(page.getByTestId("ruler-result")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Results" })).toHaveCount(0);
  await expect(page.getByTestId("ruler-plan")).toHaveCount(0);
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(page.getByTestId("ruler-step")).toContainText("Tap corner 1");
  await expect(page.getByTestId("ruler-result")).toHaveCount(0);
});
