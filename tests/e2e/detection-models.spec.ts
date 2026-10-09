/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// Stronger models on demand, the automatic delegate and several people. Runs
// the real models. This suite's Chromium has no GPU (SwiftShader), so every
// automatic delegate must resolve to CPU here, and say so.

type Last = {
  tasks: Record<
    string,
    { model: string | null; delegate: string; landmarks: number[] }
  >;
} | null;
const last = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __spectraResults: { last: Last } })
        .__spectraResults.last,
  );
async function open(
  page: Page,
  mode: string,
  store: Record<string, string> = {},
) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((entries) => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
    } catch {
      /* Storage blocked: the test then fails on what it expects. */
    }
  }, store);
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  return errors;
}

test("Precise in Objects loads EfficientDet-Lite2, finds real objects with it and runs on CPU here", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const fetched = page.waitForResponse(/models\/efficientdet_lite2\.tflite$/, {
    timeout: 90_000,
  });
  const errors = await open(page, "Objects", {
    "spectra.precision.v1": "precise",
  });
  expect((await fetched).status()).toBe(200);
  await expect
    .poll(async () => (await last(page))?.tasks.object?.model, {
      timeout: 90_000,
    })
    .toBe("efficientdet_lite2.tflite");
  // A software renderer must not be given the GPU by the automatic choice.
  expect((await last(page))?.tasks.object.delegate).toBe("CPU");
  await expect(
    page.locator(".detection-row").filter({ hasText: "person" }),
  ).toHaveCount(1, {
    timeout: 90_000,
  });
  expect(await page.locator(".detection-row").count()).toBeGreaterThanOrEqual(
    2,
  );
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

/** The generated demo person twice, side by side: two people in one image.
 * No real person's likeness is used or added. */
async function twoPeople(page: Page) {
  const png = await page.evaluate(async () => {
    const img = new Image();
    img.src = new URL("demo/studio.png", document.baseURI).href;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = 1520;
    c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    for (const x of [0, 760])
      g.drawImage(
        img,
        410,
        0,
        760,
        img.naturalHeight,
        x,
        0,
        760,
        img.naturalHeight,
      );
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "two-people.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}

test("Body follows one person by default and two when People is 2", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page, "Body");
  await twoPeople(page);
  await expect
    .poll(async () => (await last(page))?.tasks.pose?.landmarks, {
      timeout: 90_000,
    })
    .toEqual([33]);
  await expect(page.locator(".detection-row")).toHaveCount(1);
  expect(errors).toEqual([]);

  const more = await page.context().newPage();
  const errors2 = await open(more, "Body", { "spectra.people.v1": "2" });
  await twoPeople(more);
  await expect
    .poll(async () => (await last(more))?.tasks.pose?.landmarks, {
      timeout: 90_000,
    })
    .toEqual([33, 33]);
  // Each person has a row and a colour of their own, left to right.
  const rows = more.locator(".detection-row");
  await expect(rows).toHaveCount(2);
  const colours = await rows.evaluateAll((els) =>
    els.map((e) => getComputedStyle(e.querySelector("i")!).backgroundColor),
  );
  expect(new Set(colours).size).toBe(2);
  await expect(more.getByRole("alert")).toHaveCount(0);
  expect(errors2).toEqual([]);
});
