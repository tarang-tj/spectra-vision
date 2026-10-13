/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Words and rows at a phone's size with touch, in desktop Chrome. Not a
// phone: see tests/e2e/phone-layout.spec.ts.
import { test, expect, type Page } from "@playwright/test";
import { audit, openPage } from "../helpers/phone-audit";

const tips = (page: Page) => page.locator("#coach-card");
/** Open the tips (a first visit: nothing stored) and read tips 1 and 2. */
async function readTips(page: Page) {
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Tips" }).click();
  const first = (await tips(page).locator("p").nth(1).textContent())!;
  await tips(page).getByRole("button", { name: "Next tip" }).click();
  await expect(tips(page)).toContainText("Tip 2 of 3");
  return [first, (await tips(page).locator("p").nth(1).textContent())!];
}

test.describe("with touch", () => {
  test.use({ hasTouch: true, viewport: { width: 360, height: 740 } });

  test("the tips name no keyboard key, and their card is thumb sized", async ({
    page,
  }) => {
    const [one, two] = await readTips(page);
    expect(one).toContain("Use the switch at the top.");
    expect(two).toContain("Tap Effects to open or close it.");
    for (const text of [one, two]) expect(text).not.toMatch(/press/i);
    const seen = await page.evaluate(audit);
    expect(seen.small).toEqual([]);
    expect(seen.tiny).toEqual([]);
    expect(seen.scrollWidth).toBe(360);
  });

  test("at 360 px Start camera is not cut off, and the Tips pill keeps its name", async ({
    page,
  }) => {
    await openPage(page);
    const start = page.getByRole("button", { name: "Start camera" });
    for (const part of [start, start.locator("span")])
      expect(
        await part.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
    const row = await page.locator(".actions > *").evaluateAll((all) =>
      all.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    expect(row).toHaveLength(3);
    for (const b of row) {
      expect(b.left).toBeGreaterThanOrEqual(0);
      expect(b.right).toBeLessThanOrEqual(360);
    }
    // The pill shows its icon only; its name is still there to be read out.
    await expect(page.getByRole("button", { name: "Tips" })).toBeVisible();
  });
});

test.describe("with touch at 390 px", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("an Inspect row as long as a measured object's is shown whole", async ({
    page,
  }) => {
    await openPage(page);
    const rows = page.locator(".detection-row");
    await expect(page.locator(".frame-list .count")).toHaveText("4", {
      timeout: 90_000,
    });
    // The longest detail Measure objects writes (about 75 characters), put
    // into a real row by hand: making one needs the Ruler and the 99 MB
    // depth model, which tests/e2e/measured-objects.spec.ts does once on a
    // wide screen. This checks the row's layout only.
    const LONG =
      "76% · 3.4 ± 0.9 m away · box 1.5 ± 0.4 m wide, 1.8 ± 0.5 m tall";
    await rows
      .nth(1)
      .locator("small")
      .evaluate((el, text) => {
        el.textContent = text;
      }, LONG);
    const shown = await rows.nth(1).evaluate((row) => {
      const small = row.querySelector("small")!,
        r = row.getBoundingClientRect(),
        s = small.getBoundingClientRect();
      // Every line box of the words, against the row that holds them.
      const range = document.createRange();
      range.selectNodeContents(small);
      const lines = [...range.getClientRects()];
      return {
        inside: lines.every(
          (l) =>
            l.left >= r.left - 0.5 &&
            l.right <= r.right + 0.5 &&
            l.top >= r.top - 0.5 &&
            l.bottom <= r.bottom + 0.5,
        ),
        clipped: small.scrollWidth > small.clientWidth + 1,
        height: r.height,
        detailWidth: s.width,
        label: row.querySelector("span")!.getBoundingClientRect().width,
      };
    });
    expect(shown.inside).toBe(true);
    expect(shown.clipped).toBe(false);
    // The thing's name is still readable beside it.
    expect(shown.label).toBeGreaterThanOrEqual(40);
    const seen = await page.evaluate(audit);
    expect(seen.scrollWidth).toBe(390);
    expect(seen.small).toEqual([]);
    // The list still shows every row it has.
    const list = await page.locator(".detections").evaluate((el) => ({
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    expect(list.scroll).toBeLessThanOrEqual(list.client);
  });
});

test("with a mouse on a wide screen the tips still name the keys", async ({
  page,
}) => {
  const [one, two] = await readTips(page);
  expect(one).toContain("or press a number key");
  expect(two).toContain("Press E to open or close it.");
});
