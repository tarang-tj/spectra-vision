/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  drawScene,
  H,
  IMAGE,
  MARK_A,
  MARK_B,
  SHEET,
  sheetCorners,
  toImage,
  TRUTH_MM,
  type P,
} from "../fixtures/ruler-scene";

const BASIS =
  "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.";

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
async function loadScene(page: Page) {
  const png = await page.evaluate(drawScene, {
    w: IMAGE.w,
    h: IMAGE.h,
    H,
    sheet: SHEET,
    marks: [MARK_A, MARK_B],
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "ruler-scene.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}
/** Tap an image pixel: map it through the letterboxed canvas box. */
async function tap(page: Page, p: P) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h),
    x = box.x + (box.width - IMAGE.w * scale) / 2 + p.x * scale,
    y = box.y + (box.height - IMAGE.h * scale) / 2 + p.y * scale;
  await page.mouse.click(x, y);
}
const result = (page: Page) => page.getByTestId("ruler-result").first();

test("the ruler measures a known distance on a perspective photo within its own error bar", async ({
  page,
}) => {
  // Detection runs behind the stage and is slow on a loaded machine.
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await loadScene(page);
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Ruler/ })).toContainText(
    "Beta",
  );
  await page
    .getByRole("group", { name: "Units" })
    .getByRole("button", { name: "mm", exact: true })
    .click();
  const step = page.getByTestId("ruler-step");
  await expect(step).toContainText("Tap corner 1 of 4");

  // The four corners in a scrambled order, then the two marks.
  const [c0, c1, c2, c3] = sheetCorners();
  for (const c of [c2, c0, c3, c1]) await tap(page, c);
  await expect(step).toContainText("Tap two points");
  await tap(page, toImage(MARK_A));
  await expect(step).toContainText("other end");
  await tap(page, toImage(MARK_B));

  // Shown as value ± error, within 1% of the truth, truth inside the bar.
  const out = result(page).locator("output");
  await expect(out).toHaveText(/^[\d.]+ ± [\d.]+ mm$/);
  const value = Number(await out.getAttribute("data-mm")),
    error = Number(await out.getAttribute("data-error-mm")),
    text = (await out.textContent())!;
  expect(Math.abs(value - TRUTH_MM) / TRUTH_MM).toBeLessThan(0.01);
  expect(Math.abs(value - TRUTH_MM)).toBeLessThanOrEqual(error);
  expect(error).toBeGreaterThan(0);
  test.info().annotations.push({
    type: "measured",
    description: `${value.toFixed(2)} mm, bar ${error.toFixed(2)} mm, truth ${TRUTH_MM.toFixed(2)} mm, off by ${(value - TRUTH_MM).toFixed(2)} mm (${(((value - TRUTH_MM) / TRUTH_MM) * 100).toFixed(2)}%)`,
  });
  expect(Math.abs(Number(text.split(" ")[0]) - value)).toBeLessThan(error);
  await expect(page.getByTestId("ruler-basis")).toHaveText(BASIS);

  // Units: the same span in cm.
  await page
    .getByRole("group", { name: "Units" })
    .getByRole("button", { name: "cm", exact: true })
    .click();
  const cm = (await result(page).locator("output").textContent())!;
  expect(Math.abs(Number(cm.split(" ")[0]) - value / 10)).toBeLessThan(
    error / 10,
  );

  // Copy results writes plain text to the clipboard.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy results" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(`Measurement 1: ${cm}`);

  // The line is drawn on the stage canvas, so Screenshot would capture it.
  const lit = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas")!,
        d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] === 164 && d[i + 1] === 255 && d[i + 2] === 217) n++;
      return n;
    });
  await expect.poll(lit).toBeGreaterThan(30);

  // Another tab and back: the store keeps the result, the overlay returns.
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lab" })).toBeVisible();
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await expect(result(page).locator("output")).toHaveText(cm);
  await expect.poll(lit).toBeGreaterThan(30);

  // Swap sides gives a different, wrong answer, so the control does something.
  await page.getByRole("button", { name: "Swap sides" }).click();
  await expect(result(page).locator("output")).not.toHaveText(cm);
  await page.getByRole("button", { name: "Swap sides" }).click();
  await expect(result(page).locator("output")).toHaveText(cm);

  // At 390 px wide: no sideways scroll, no control outside the viewport, and
  // every control at least 40 px tall.
  await page.setViewportSize({ width: 390, height: 844 });
  const layout = await page.evaluate(() => {
    const bad: string[] = [];
    document
      .querySelectorAll<HTMLElement>(
        ".ruler-panel button, .ruler-panel input, .ruler-panel select",
      )
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.height < 39.5)
          bad.push(`${el.textContent} ${r.left}|${r.right}|${r.height}`);
      });
    return {
      scroll: document.documentElement.scrollWidth - innerWidth,
      panel:
        document.querySelector<HTMLElement>(".ruler-panel")!.scrollWidth -
        document.querySelector<HTMLElement>(".ruler-panel")!.clientWidth,
      bad,
    };
  });
  expect(layout.scroll).toBeLessThanOrEqual(0);
  expect(layout.panel).toBeLessThanOrEqual(0);
  expect(layout.bad).toEqual([]);
  expect(errors).toEqual([]);
});

test("a live source is frozen by the ruler and resumed when the panel closes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await expect(page.getByTestId("ruler-step")).toContainText("Freeze");
  await expect(
    page.getByRole("button", { name: "Pause detection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(
    page.getByRole("button", { name: "Resume detection" }),
  ).toBeVisible();
  await expect(page.getByTestId("ruler-step")).toContainText("Tap corner 1");
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause detection" }),
  ).toBeVisible();
});

test("on a camera source, points and results are dropped when the picture moves on", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(page.getByTestId("ruler-step")).toContainText("Tap corner 1");

  // Four corners and two ends, by fraction of the canvas box (the middle of
  // the picture, clear of the letterbox bars).
  const at = async (fx: number, fy: number) => {
    const box = (await page.locator(".camera-stage canvas").boundingBox())!;
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
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

  // Resuming drops them, so an old value cannot be shown on a new frame.
  await page.getByRole("button", { name: "Resume live view" }).click();
  await expect(page.getByTestId("ruler-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Freeze frame" }).click();
  await expect(page.getByTestId("ruler-step")).toContainText("Tap corner 1");
  await expect(page.getByTestId("ruler-result")).toHaveCount(0);
});
