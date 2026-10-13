/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The page at a phone's size with touch, in desktop Chrome. This shows the
// layout at a width and a height. It is not a phone: nothing here knows a
// phone browser's bars, keyboard, notch or speed.
import { test, expect, type Page } from "@playwright/test";
import {
  PANELS,
  audit,
  modeButton,
  openPage,
  openTab,
  tab,
} from "../helpers/phone-audit";
import { BACK, FRONT, standInCameras } from "../helpers/stand-in-cameras";

test.use({ hasTouch: true });

const PORTRAIT = [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ],
  LANDSCAPE = [
    { width: 740, height: 360 },
    { width: 844, height: 390 },
  ],
  BAR = 56;
const stage = (page: Page) => page.locator(".camera-stage");
const rect = async (page: Page, selector: string) =>
  (await page.locator(selector).first().boundingBox())!;
const position = (page: Page) =>
  stage(page).evaluate((el) => getComputedStyle(el).position);

/** Nothing wider than the screen, nothing too small to press or to read. */
async function check(page: Page, where: string) {
  const seen = await page.evaluate(audit);
  expect.soft(seen.scrollWidth, `${where}: page width`).toBe(seen.width);
  expect.soft(seen.small, `${where}: targets under 44 x 44`).toEqual([]);
  expect.soft(seen.tiny, `${where}: text under 12 px`).toEqual([]);
  expect.soft(seen.fields, `${where}: fields under 16 px`).toEqual([]);
}

for (const size of [...PORTRAIT, ...LANDSCAPE])
  test(`${size.width} x ${size.height}: on every tab and in every mode but Depth nothing scrolls sideways, is too small to press or too small to read`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(size);
    await openPage(page);
    for (const name of PANELS) {
      await openTab(page, name);
      await check(page, name);
    }
    // The Ruler's own fields.
    await openTab(page, "Ruler");
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await expect(page.getByLabel("Side 1 (mm)")).toBeVisible();
    await check(page, "Ruler, custom reference");
    // The effects tray and the help text.
    await openTab(page, "Inspect");
    await page.locator(".deck-toggle").click();
    await page
      .getByRole("button", { name: "About privacy and controls" })
      .click();
    await expect(page.locator(".help")).toBeVisible();
    await check(page, "Effects tray and help");
    const modes = await page
      .getByRole("navigation", { name: "Vision mode" })
      .getByRole("button")
      .allTextContents();
    expect(modes).toContain("Depth");
    for (const name of modes.filter((mode) => mode !== "Depth")) {
      await modeButton(page, name).click();
      await expect(modeButton(page, name)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator(".mode-tip")).toBeVisible();
      await check(page, `${name} mode`);
    }
  });

for (const size of PORTRAIT)
  test(`${size.width} x ${size.height}: the picture comes first, with its tools in a bar under it`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openPage(page);
    const box = await rect(page, ".camera-stage"),
      bar = await rect(page, ".stage-bottom");
    expect(box.y).toBeLessThanOrEqual(260);
    expect(bar.y + bar.height).toBeLessThanOrEqual(600);
    expect(box.width * box.height).toBeGreaterThanOrEqual(
      0.28 * size.width * size.height,
    );
    // Every tool is under the picture, thumb sized, and on the screen.
    const tools = page.locator(".stage-bottom button");
    expect(await tools.count()).toBeGreaterThanOrEqual(5);
    for (const tool of await tools.all()) {
      const b = (await tool.boundingBox())!;
      expect(b.y).toBeGreaterThanOrEqual(box.y + box.height - 1);
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(size.width);
    }
    // And none of them covers the picture: 10 px above its bottom edge the
    // finger is on the canvas all the way across.
    const hit = await page.evaluate(
      ([left, right, y]) => {
        const found = new Set<string>();
        for (let x = left + 4; x < right - 4; x += 12)
          found.add(document.elementFromPoint(x, y)?.tagName ?? "nothing");
        return [...found];
      },
      [box.x, box.x + box.width, box.y + box.height - 10],
    );
    expect(hit).toEqual(["CANVAS"]);
  });

test("a portrait camera on a 700 px tall view keeps Flip on the first screen", async ({
  page,
}) => {
  // 390 x 700: a tall phone's screen with the browser's bars taken off it.
  await page.setViewportSize({ width: 390, height: 700 });
  await standInCameras(page, [FRONT, BACK]);
  await openPage(page, "");
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.locator(".hud-badge").first()).toContainText("720×1280");
  await page.evaluate(() => scrollTo(0, 0));
  const flip = (await page
    .getByRole("button", { name: "Flip camera" })
    .boundingBox())!;
  expect(flip.y + flip.height).toBeLessThanOrEqual(700);
  const box = await rect(page, ".camera-stage");
  expect(box.height).toBeLessThanOrEqual(0.55 * 700 + 1);
  expect(box.width / box.height).toBeCloseTo(3 / 4, 1);
});

test("the picture stays at the top while the Ruler's panel scrolls, and lets go while a field is typed in", async ({
  page,
}) => {
  await page.setViewportSize(PORTRAIT[0]);
  await openPage(page);
  await openTab(page, "Ruler");
  const step = page.getByTestId("ruler-step");
  await step.evaluate((el) => el.scrollIntoView());
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(100);
  const box = await rect(page, ".camera-stage"),
    line = (await step.boundingBox())!;
  expect(box.y).toBe(0);
  // The instruction for the next tap is on screen under the picture's bar.
  expect(line.y).toBeGreaterThanOrEqual(box.height + BAR);
  expect(line.y + line.height).toBeLessThanOrEqual(PORTRAIT[0].height);
  expect(await position(page)).toBe("sticky");
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  const field = page.getByLabel("Side 1 (mm)");
  await field.focus();
  expect(await position(page)).toBe("relative");
  // Its badges and its bar are still on it.
  const letGo = await rect(page, ".camera-stage"),
    bar = await rect(page, ".stage-bottom"),
    badge = await rect(page, ".hud-badge");
  expect(Math.abs(bar.y - (letGo.y + letGo.height))).toBeLessThanOrEqual(1);
  expect(badge.y).toBeGreaterThanOrEqual(letGo.y);
  expect(badge.y).toBeLessThanOrEqual(letGo.y + 40);
  await field.blur();
  expect(await position(page)).toBe("sticky");
});

for (const size of LANDSCAPE)
  test(`${size.width} x ${size.height}: the whole picture and its tools fit the screen's height, and the picture is not pinned`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openPage(page);
    const box = await rect(page, ".camera-stage");
    expect(box.height + BAR).toBeLessThanOrEqual(size.height);
    expect(box.width / box.height).toBeCloseTo(
      size.width <= 760 ? 4 / 3 : 1.6,
      1,
    );
    expect(await position(page)).not.toBe("sticky");
    for (const tool of await page.locator(".stage-bottom button").all()) {
      const b = (await tool.boundingBox())!;
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
  });

test("turning the screen keeps the mode and the tab, and nothing scrolls sideways either way", async ({
  page,
}) => {
  await page.setViewportSize(PORTRAIT[0]);
  await openPage(page);
  await modeButton(page, "Hands").click();
  await openTab(page, "Lab");
  for (const size of [LANDSCAPE[1], PORTRAIT[0]]) {
    await page.setViewportSize(size);
    await expect(modeButton(page, "Hands")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(tab(page, "Lab")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".panel-body")).toContainText("This device");
    const seen = await page.evaluate(audit);
    expect(seen.scrollWidth).toBe(size.width);
  }
});
