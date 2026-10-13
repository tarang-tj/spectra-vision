/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// The inspector rail at four screen sizes: its tabs, its height, what the
// Inspect list shows, the phone Library, and the command palette as a dialog.
const SIZES = [
  { name: "desktop", width: 1536, height: 1024 },
  { name: "small laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
];
const PANELS = ["Inspect", "Lab", "Library", "Ruler", "Presence"];
const tabs = (page: Page) =>
  page.getByRole("navigation", { name: "Inspector panel" });
const tab = (page: Page, name: string) =>
  tabs(page).getByRole("button", { name, exact: true });

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
/** Sizes of the page and the rail, read in the page. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const box = (s: string) =>
        document.querySelector(s)?.getBoundingClientRect() ?? null,
      body = document.querySelector(".panel-body")!,
      list = document.querySelector(".detections");
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      scrollX,
      tabs: [...document.querySelectorAll("nav.panel-tabs button")].map((b) => {
        const r = b.getBoundingClientRect();
        return { name: b.textContent, left: r.left, right: r.right };
      }),
      strip: box("nav.panel-tabs")!,
      rail: box(".inspector")!,
      stage: box(".camera-stage")!,
      deck: box(".deck")!,
      body: { client: body.clientHeight, scroll: body.scrollHeight },
      bar: getComputedStyle(body, "::-webkit-scrollbar").width,
      list: list && {
        client: list.clientHeight,
        scroll: list.scrollHeight,
        rows: list.querySelectorAll(".detection-row").length,
      },
      count: document.querySelector(".frame-list .count")?.textContent ?? null,
    };
  });

for (const size of SIZES)
  test(`${size.name} (${size.width} px): every tab is on screen, nothing scrolls sideways, the list shows every row`, async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(size);
    await open(page);
    // The Objects demo has four things in it; the heading counts them.
    await expect(page.locator(".frame-list .count")).toHaveText("4", {
      timeout: 90_000,
    });
    const first = await measure(page);
    // The list shows the rows it has: none is cut off inside it.
    expect(first.list).not.toBeNull();
    expect(first.list!.rows).toBe(Number(first.count));
    expect(first.list!.scroll).toBeLessThanOrEqual(first.list!.client);
    for (const name of PANELS) {
      await tab(page, name).click();
      await expect(tab(page, name)).toHaveAttribute("aria-pressed", "true");
      const m = await measure(page);
      expect(m.scrollWidth, `${name}: page width`).toBe(m.viewport);
      expect(m.scrollX, `${name}: sideways scroll`).toBe(0);
      expect(m.tabs).toHaveLength(PANELS.length);
      for (const t of m.tabs) {
        expect(t.left, `${t.name} tab, left`).toBeGreaterThanOrEqual(0);
        expect(t.right, `${t.name} tab, right`).toBeLessThanOrEqual(m.viewport);
        // Inside the strip's own border too, not poking through it.
        expect(t.left).toBeGreaterThanOrEqual(m.strip.left);
        expect(t.right).toBeLessThanOrEqual(m.strip.right);
      }
      // The stage keeps its 16:10 shape (4:3 on a phone) whatever is open.
      expect(m.stage.width / m.stage.height).toBeCloseTo(
        size.width <= 760 ? 4 / 3 : 1.6,
        1,
      );
      if (size.width > 760 && m.body.scroll > m.body.client)
        // A panel longer than the rail scrolls, with a bar that stays shown.
        expect(m.bar, `${name}: scrollbar`).toBe("8px");
    }
    const last = await measure(page);
    if (size.name === "tablet") {
      // 768 by 1024: the rail was 301 px tall with 221 px for the panel.
      expect(last.rail.height).toBeGreaterThanOrEqual(520);
      expect(last.body.client).toBeGreaterThanOrEqual(400);
    }
    if (size.name === "small laptop") {
      // 1024 by 768: the rail runs down beside the effects tray as well.
      expect(last.rail.bottom).toBeGreaterThanOrEqual(last.deck.bottom - 1);
      expect(last.body.client).toBeGreaterThanOrEqual(375);
    }
  });

test("the phone Library takes the full width and its checkboxes are finger sized", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await tab(page, "Library").click();
  await expect(page.locator(".library-panel")).toBeVisible();
  const panel = (await page.locator(".library-panel").boundingBox())!,
    body = (await page.locator(".panel-body").boundingBox())!;
  // It was one 153 px column of a two-column grid.
  expect(panel.width).toBeGreaterThanOrEqual(body.width - 1);
  expect(panel.width).toBeGreaterThanOrEqual(300);
  const boxes = page.locator('.library-list input[type="checkbox"]');
  for (const i of [0, 1, 2]) {
    const b = (await boxes.nth(i).boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(40);
    expect(b.height).toBeGreaterThanOrEqual(40);
    expect(b.x).toBeGreaterThanOrEqual(0);
  }
  for (const b of await page
    .getByRole("group", { name: "Filter mode" })
    .getByRole("button")
    .all())
    expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  const search = page.getByLabel("Search classes");
  expect((await search.boundingBox())!.height).toBeGreaterThanOrEqual(40);
  // The field is drawn in the page's own colours, not the browser's white.
  expect(
    await search.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe("rgb(255, 255, 255)");
  // A ticked box is still a checkbox that says so, from a press or the keyboard.
  await boxes.first().click();
  await expect(boxes.first()).toBeChecked();
  await boxes.first().press("Space");
  await expect(boxes.first()).not.toBeChecked();
});

test("Confidence and the motion map are shown only in a mode that locates things", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page);
  const mode = (name: string) =>
      page
        .getByRole("navigation", { name: "Vision mode" })
        .getByRole("button", { name, exact: true }),
    map = page.getByRole("img", { name: /^Motion map/ });
  await expect(page.locator("#confidence")).toBeVisible();
  await expect(map).toBeVisible();
  // Depth is one reading of the whole picture: nothing to threshold or plot.
  await mode("Depth").click();
  await expect(mode("Depth")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#confidence")).toHaveCount(0);
  await expect(map).toHaveCount(0);
  await expect(page.getByText("Confidence", { exact: true })).toHaveCount(0);
  await mode("Body").click();
  await expect(page.locator("#confidence")).toBeVisible();
  await expect(map).toBeVisible();
});

test("the command palette is a modal dialog and gives focus back to what opened it", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await open(page);
  const opener = page.getByRole("button", { name: "Open command palette" }),
    dialog = page.getByRole("dialog", { name: "Command palette" }),
    field = page.getByRole("combobox", { name: "Search commands" });
  await opener.click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();

  // Opened from the keyboard while another control has focus: back to it.
  await tab(page, "Ruler").focus();
  await page.keyboard.press("Control+k");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tab(page, "Ruler")).toBeFocused();

  // A browser that does not focus a clicked button (Safari on a Mac) leaves
  // focus on the body when the palette opens. Esc still lands on the button.
  await opener.click();
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await opener.evaluate((el: HTMLElement) => el.blur());
  await page.evaluate(() =>
    document
      .querySelector<HTMLElement>('[aria-label="Open command palette"]')!
      .dispatchEvent(new MouseEvent("click", { bubbles: true })),
  );
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  // Closing by a press on the dimmed page gives focus back as well.
  await opener.click();
  await expect(field).toBeFocused();
  await page.mouse.click(12, 600);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});
