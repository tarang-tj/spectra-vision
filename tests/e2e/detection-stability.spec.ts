/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// The stability meter in the Lab, on the real models and the demo inputs.
// Figures are read from the unrounded `data-value` of each reading.

async function openLab(
  page: Page,
  mode: string,
  options: { motion?: boolean; smoothing?: boolean } = {},
) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((smoothing) => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
      if (smoothing) localStorage.setItem("spectra.smooth.v1", "on");
    } catch {
      /* Storage blocked: the test then deals with whatever is shown. */
    }
  }, !!options.smoothing);
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: mode, exact: true }).click();
  if (options.motion)
    await page.getByRole("button", { name: "Try motion demo" }).click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Stability" })).toBeVisible();
  return errors;
}
const value = async (page: Page, id: string) =>
  Number(await page.getByTestId(id).getAttribute("data-value"));
const finite = (n: number) => Number.isFinite(n);

test("on the still demo the meter shows finite raw and smoothed jitter, smoothed not larger", async ({
  page,
}) => {
  const errors = await openLab(page, "Hands");
  await expect
    .poll(async () => finite(await value(page, "stability-raw-hand")), {
      timeout: 90_000,
    })
    .toBe(true);
  await expect
    .poll(async () => finite(await value(page, "stability-smooth-hand")), {
      timeout: 30_000,
    })
    .toBe(true);
  // Two hands of 21 points each reach the minimum number of results.
  await expect
    .poll(async () =>
      Number(await page.getByTestId("stability-points-hand").textContent()),
    )
    .toBeGreaterThan(20);
  await expect(page.getByTestId("stability-raw-hand")).toHaveText(
    /^\d+\.\d\d px$/,
  );
  // The same results, filtered: never wider than raw on an input that stands still.
  await expect
    .poll(
      async () => {
        const raw = await value(page, "stability-raw-hand"),
          smooth = await value(page, "stability-smooth-hand");
        return finite(raw) && finite(smooth) && raw < 20 && smooth <= raw;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
  // The chart was really drawn.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(
            ".lab-stability canvas",
          )!,
          data = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) ink++;
        return ink;
      }),
    )
    .toBeGreaterThan(200);
  expect(errors).toEqual([]);
});

test("a tracked mode shows box spread and identity switches", async ({
  page,
}) => {
  const errors = await openLab(page, "Objects");
  await expect
    .poll(async () => finite(await value(page, "stability-boxes")), {
      timeout: 90_000,
    })
    .toBe(true);
  await expect(page.getByTestId("stability-switches")).toHaveText(
    /^\d+ in \d+ s$/,
  );
  // No landmarks in this mode: no landmark rows.
  await expect(page.getByTestId("stability-raw-hand")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("on the moving demo, with Smooth landmarks on, the figures are finite and moving shows real spread", async ({
  page,
}) => {
  await openLab(page, "Hands", { motion: true, smoothing: true });
  await expect(page.getByText("(on now)")).toBeVisible();
  await expect
    .poll(async () => finite(await value(page, "stability-raw-hand")), {
      timeout: 90_000,
    })
    .toBe(true);
  // A hand that moves has real spread, far above the still figure.
  await expect.poll(() => value(page, "stability-raw-hand")).toBeGreaterThan(1);
  await expect
    .poll(async () => finite(await value(page, "stability-smooth-hand")))
    .toBe(true);
});
