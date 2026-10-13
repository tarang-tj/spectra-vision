/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Two Lab and Objects controls that fetch a lot, on a touch-first device, in
// desktop Chrome with touch switched on. Not a phone or a tablet: this shows
// what the page asks the network for and how its blocks are laid out.
import { test, expect, type Page } from "@playwright/test";
import { audit, openPage, openTab } from "../helpers/phone-audit";

const DEMO = { w: 1586, h: 992 };
/** A press at a demo picture position, through the letterboxed canvas. The
 * smaller demo file has the same shape, so the same positions hold. */
async function press(page: Page, x: number, y: number) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / DEMO.w, box.height / DEMO.h);
  await page.mouse.click(
    box.x + (box.width - DEMO.w * scale) / 2 + x * scale,
    box.y + (box.height - DEMO.h * scale) / 2 + y * scale,
  );
}

test.describe("with touch on a tablet-sized screen", () => {
  // Wide enough that no Ruler corner below lands under a stage tool.
  test.use({ hasTouch: true, viewport: { width: 1366, height: 1024 } });

  test("Measure objects asks before the 99 MB depth model, once the Ruler is ready and not before", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    const fetched: string[] = [];
    page.on("request", (request) => {
      if (/depth-worker|models\/depth|runtime\/ort/.test(request.url()))
        fetched.push(request.url().replace(/^.*?\/\/[^/]+/, ""));
    });
    await openPage(page);
    await expect(page.locator(".detection-row").first()).toBeVisible();
    const status = page.getByTestId("measure-status"),
      download = page.getByTestId("measure-download"),
      shape = (name: string) =>
        page
          .getByRole("group", { name: "Shape", exact: true })
          .getByRole("button", { name, exact: true });
    await page
      .getByRole("button", { name: "Measure objects", exact: true })
      .click();
    // The Ruler is what is missing first: no question yet.
    await expect(status).toContainText("the Ruler has no reference");
    await expect(download).toHaveCount(0);
    await openTab(page, "Ruler");
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await page.getByLabel("Side 1 (mm)").fill("1450");
    await page.getByLabel("Side 2 (mm)").fill("1000");
    for (const [x, y] of [
      [912, 722],
      [1200, 722],
      [1450, 865],
      [985, 865],
    ])
      await press(page, x, y);
    await expect(page.getByTestId("ruler-step")).toContainText(
      "Tap two points",
    );
    await shape("Area").click();
    for (const [x, y] of [
      [80, 980],
      [560, 980],
      [600, 760],
      [420, 740],
    ])
      await press(page, x, y);
    await shape("Close outline").click();
    await openTab(page, "Inspect");
    // Ready, and on this device the model waits for a yes.
    await expect(status).toContainText(
      "Nothing is downloaded until you press the button below.",
    );
    await expect(download).toHaveText("Download 99 MB");
    await page.waitForTimeout(1500);
    expect(fetched).toEqual([]);
    await download.click();
    await expect(download).toHaveCount(0);
    await expect
      .poll(() => fetched.some((url) => /models\/depth/.test(url)), {
        timeout: 60_000,
      })
      .toBe(true);
  });
});

test.describe("with touch at 390 px", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the Lab's scorecard, with results and its picture viewer, fits the screen and is thumb sized", async ({
    page,
  }) => {
    test.setTimeout(300_000);
    // The whole set on the smallest model: a shortened run has too few
    // objects for the by-class table to be drawn.
    await openPage(page);
    await openTab(page, "Lab");
    const card = page.getByTestId("scorecard");
    await card.getByLabel(/EfficientDet-Lite2/).uncheck();
    await card.getByRole("button", { name: "Run scorecard" }).click();
    await expect(card.getByTestId("score-progress")).toHaveText(
      /^Finished \d+ runs?\.$/,
      { timeout: 240_000 },
    );
    await expect(
      card.getByTestId("score-results").locator("tbody tr").first(),
    ).toBeVisible();
    await expect(card.getByTestId("score-place")).toHaveText(
      "Picture 1 of 100",
    );
    await card.getByRole("button", { name: "Next" }).click();
    await expect(card.getByTestId("score-place")).toHaveText(
      "Picture 2 of 100",
    );
    await card.locator("summary", { hasText: "By class" }).click();
    await expect(card.locator("details table")).toBeVisible();
    const seen = await page.evaluate(audit);
    expect(seen.scrollWidth).toBe(390);
    expect(seen.small).toEqual([]);
    expect(seen.tiny).toEqual([]);
    expect(seen.fields).toEqual([]);
    // No table or picture in the block is wider than the block.
    const wide = await card.evaluate((block) =>
      [...block.querySelectorAll("table, img, canvas, ul, p")]
        .filter(
          (el) =>
            el.getBoundingClientRect().right >
            block.getBoundingClientRect().right + 0.5,
        )
        .map((el) => el.tagName),
    );
    expect(wide).toEqual([]);
    await card.screenshot({
      path: test.info().outputPath("scorecard-390.png"),
    });
  });
});
