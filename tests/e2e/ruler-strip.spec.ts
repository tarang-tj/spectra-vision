/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import { drawRoom, H, IMAGE, ROOM, SHEET } from "../fixtures/ruler-room-scene";

// The stage's own controls sit in a strip along its bottom edge. The empty
// space around them must pass taps through to the picture.
for (const width of [1536, 390]) {
  test(`Ruler accepts a tap in the empty bottom strip at ${width} px`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 });
    await page.addInitScript(() => {
      try {
        localStorage.setItem("spectra.coach.v1", "1");
      } catch {
        /* Storage blocked: the test deals with whatever is shown. */
      }
    });
    await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
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
    await page.getByRole("button", { name: "Ruler", exact: true }).click();
    await page.getByRole("button", { name: "Custom", exact: true }).click();
    await page.getByLabel("Side 1 (mm)").fill("1000");
    await page.getByLabel("Side 2 (mm)").fill("700");
    const step = page.getByTestId("ruler-step");
    await expect(step).toContainText("Tap corner 1");

    await page.evaluate(() => scrollTo(0, 0));
    const gap = await emptyStripPoint(page);
    await page.mouse.click(gap.x, gap.y);
    await expect(step).toContainText("Tap corner 2");

    // Under a control the tap still belongs to the control, not the picture.
    const tool = (await page.getByLabel("Mirror").boundingBox())!;
    await page.mouse.move(tool.x + tool.width / 2, tool.y + tool.height / 2);
    expect(
      await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest("button") !== null,
        [tool.x + tool.width / 2, tool.y + tool.height / 2],
      ),
    ).toBe(true);
    await expect(page.getByLabel("Mirror")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.getByLabel("Mirror").click();
    await expect(page.getByLabel("Mirror")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(step).toContainText("Tap corner 2");
  });
}

/** A point between the playback label and the tools row, level with the tools row. */
async function emptyStripPoint(page: Page) {
  const label = (await page.locator(".playback").boundingBox())!,
    tools = (await page.locator(".stage-tools").boundingBox())!;
  return {
    x: (label.x + label.width + tools.x) / 2,
    y: tools.y + tools.height / 2,
  };
}
