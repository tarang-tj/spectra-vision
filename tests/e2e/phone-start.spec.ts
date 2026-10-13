/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What a touch-first device is sent and asked at the start, in desktop
// Chrome with touch switched on. It shows what the page asks the network
// for. It is not a phone and says nothing about a phone's speed.
import { test, expect, type Page } from "@playwright/test";
import { modeButton, openPage, openTab } from "../helpers/phone-audit";

/** Every address asked for from now on, without the host. */
function requests(page: Page) {
  const seen: string[] = [];
  page.on("request", (request) =>
    seen.push(request.url().replace(/^.*?\/\/[^/]+/, "")),
  );
  return seen;
}
const count = (page: Page) => page.locator(".frame-list .count");
const card = (page: Page) => page.getByTestId("download-ask");
const DEPTH_MODEL = /models\/depth_/;

test.describe("with touch at 390 px", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the demo picture is the smaller file, and Objects still finds its four things", async ({
    page,
  }) => {
    const seen = requests(page);
    await openPage(page);
    await expect(count(page)).toHaveText("4", { timeout: 90_000 });
    expect(seen.some((url) => url.includes("demo/studio-phone.webp"))).toBe(
      true,
    );
    expect(seen.filter((url) => url.includes("demo/studio.png"))).toEqual([]);
    expect(
      (await page.locator(".detection-row span").allTextContents()).sort(),
    ).toEqual(["chair", "person", "potted plant", "potted plant"]);
    await expect(page.locator(".hud-badge").first()).toHaveText("DEMO IMAGE");
  });

  test("Depth asks before its 99 MB download, and nothing is fetched until the answer is yes", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const seen = requests(page);
    await openPage(page);
    await modeButton(page, "Depth").click();
    await expect(card(page)).toContainText("Depth needs a 99 MB download");
    await expect(card(page)).toContainText(
      "Depth's model is 99 MB, plus its runtime. Nothing is shown in Depth until it has arrived.",
    );
    await expect(modeButton(page, "Objects")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth === innerWidth,
      ),
    ).toBe(true);
    await card(page).getByRole("button", { name: "Not now" }).click();
    await expect(card(page)).toHaveCount(0);
    await expect(modeButton(page, "Objects")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // Another mode needs no question.
    await modeButton(page, "Hands").click();
    await expect(modeButton(page, "Hands")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card(page)).toHaveCount(0);
    await modeButton(page, "Depth").click();
    await expect(card(page)).toBeVisible();
    await page.waitForTimeout(1000);
    expect(seen.filter((url) => DEPTH_MODEL.test(url))).toEqual([]);
    expect(seen.filter((url) => /depth-worker|runtime\/ort/.test(url))).toEqual(
      [],
    );
    await card(page).getByRole("button", { name: "Download 99 MB" }).click();
    await expect(modeButton(page, "Depth")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card(page)).toHaveCount(0);
    await expect
      .poll(() => seen.some((url) => DEPTH_MODEL.test(url)), {
        timeout: 60_000,
      })
      .toBe(true);
    // The yes holds for this page: going away and back asks nothing.
    await modeButton(page, "Objects").click();
    await modeButton(page, "Depth").click();
    await expect(modeButton(page, "Depth")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card(page)).toHaveCount(0);
  });

  test("the Lab says which Objects model was chosen here, why, and what nobody measured", async ({
    page,
  }) => {
    await openPage(page);
    await openTab(page, "Lab");
    const block = page.getByTestId("lab-device"),
      choice = page.getByTestId("lab-device-choice"),
      row = (name: string) =>
        block.locator("div", { has: page.getByText(name, { exact: true }) });
    await expect(row("Main pointer").locator("dd")).toHaveText("touch");
    await expect(row("Screen").locator("dd")).toHaveText(
      "390 x 844 CSS px at 1x",
    );
    await expect(row("Graphics").locator("dd")).toHaveText(/\S/);
    await expect(row("Processor threads").locator("dd")).toHaveText(
      /^(\d+|not reported)$/,
    );
    await expect(choice).toContainText("Read from this browser, not measured.");
    await expect(choice).toContainText("7 MB");
    await expect(choice).toContainText("main pointer is touch");
    await expect(choice).toContainText("Nobody has timed the 12 MB model");
    // The switch it names is off here, one press from on.
    await openTab(page, "Inspect");
    const larger = page.getByRole("button", { name: "Larger model on a GPU" });
    await expect(larger).toHaveAttribute("aria-pressed", "false");
    await larger.click();
    await expect(larger).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("with a mouse on a wide screen", () => {
  test("the demo picture is the full one and Objects finds its four things", async ({
    page,
  }) => {
    const seen = requests(page);
    await openPage(page);
    await expect(count(page)).toHaveText("4", { timeout: 90_000 });
    expect(seen.some((url) => url.includes("demo/studio.png"))).toBe(true);
    expect(seen.filter((url) => url.includes("-phone.webp"))).toEqual([]);
  });

  test("Depth is not asked about, and the Lab gives the other reason", async ({
    page,
  }) => {
    const seen = requests(page);
    await openPage(page);
    await openTab(page, "Lab");
    const block = page.getByTestId("lab-device");
    await expect(block).toContainText("mouse or trackpad");
    await expect(page.getByTestId("lab-device-choice")).toHaveText(
      "Read from this browser, not measured. Objects starts on the 12 MB model where a real graphics processor is found and on the 7 MB one otherwise.",
    );
    await openTab(page, "Inspect");
    await expect(
      page.getByRole("button", { name: "Larger model on a GPU" }),
    ).toHaveAttribute("aria-pressed", "true");
    await modeButton(page, "Depth").click();
    await expect(modeButton(page, "Depth")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(card(page)).toHaveCount(0);
    await expect
      .poll(() => seen.some((url) => DEPTH_MODEL.test(url)), {
        timeout: 60_000,
      })
      .toBe(true);
  });
});
