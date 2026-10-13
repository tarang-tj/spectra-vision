/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

// Measure objects on the real models, on the WebAssembly path (this suite's
// browser has no GPU, like CI): Objects on the demo still, the Ruler tapped
// as tests/e2e/depth.spec.ts taps it. The demo still is a generated picture
// with no known sizes, so nothing here checks a number against a truth
// (tests/object-measured.test.ts does that on a synthetic scene). What is
// checked: nothing of the depth model is fetched until it can be used, every
// number shown has a bar and its basis, and a moving picture gets none.

const DEMO = { w: 1586, h: 992 };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^INFO: /.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}
const panel = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
/** Screen position of a demo image pixel, through the letterboxed canvas. */
async function tap(page: Page, x: number, y: number) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / DEMO.w, box.height / DEMO.h);
  await page.mouse.click(
    box.x + (box.width - DEMO.w * scale) / 2 + x * scale,
    box.y + (box.height - DEMO.h * scale) / 2 + y * scale,
  );
}

test("Measure objects is opt-in, fetches the depth model only once the Ruler is ready, and states every number with its bar", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page),
    fetched: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    // The worker, the model and the runtime (not the app's own source files).
    if (/depth-worker|models\/depth|runtime\/ort/.test(url))
      fetched.push(url.replace(/^.*?\/\/[^/]+/, ""));
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  const latency = page.getByTestId("latency"),
    status = page.getByTestId("measure-status"),
    rows = page.locator(".detection-row"),
    measuredRows = rows.filter({ hasText: "m away" }),
    button = page.getByRole("button", { name: "Measure objects", exact: true }),
    shape = (name: string) =>
      page
        .getByRole("group", { name: "Shape", exact: true })
        .getByRole("button", { name, exact: true });
  await expect(latency).toHaveText(/^\d+ ms$/);
  await expect(rows.first()).toBeVisible();

  // Off: no status line, no number, nothing of Depth fetched.
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(status).toHaveCount(0);
  const plain = await rows.allTextContents();
  expect(plain.join(" ")).not.toMatch(/m away|measured/);
  expect(fetched).toEqual([]);

  // On, with no reference in the Ruler: it says what is missing and still
  // fetches nothing.
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(status).toHaveAttribute("data-state", "waiting");
  await expect(status).toContainText(
    "the Ruler has no reference on this photo",
  );
  await expect(status).toContainText("not downloaded until then");
  await page.waitForTimeout(1500);
  expect(fetched).toEqual([]);
  await expect(measuredRows).toHaveCount(0);

  // The Ruler's reference and a patch of floor from near to far, as the
  // Depth test marks them.
  await panel(page, "Ruler").click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1450");
  await page.getByLabel("Side 2 (mm)").fill("1000");
  const corners = [
    [912, 722],
    [1200, 722],
    [1450, 865],
    [985, 865],
  ];
  for (const [x, y] of corners.slice(0, 3)) await tap(page, x, y);
  // Three corners are not a reference: still nothing fetched.
  await page.waitForTimeout(500);
  expect(fetched).toEqual([]);
  await tap(page, corners[3][0], corners[3][1]);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");
  await shape("Area").click();
  for (const [x, y] of [
    [80, 980],
    [560, 980],
    [600, 760],
    [420, 740],
  ])
    await tap(page, x, y);
  await shape("Close outline").click();
  // Now the model is wanted, and only now was it asked for.
  await expect
    .poll(() => fetched.some((url) => /depth-worker/.test(url)), {
      timeout: 30_000,
    })
    .toBe(true);

  await panel(page, "Inspect").click();
  await expect(status).toHaveAttribute("data-state", "ready", {
    timeout: 180_000,
  });
  await expect(status).toContainText(
    /Measuring \d+ of \d+ box(es)?\. One depth map, \d+ x \d+ cells, made in \d+ ms on CPU \(WebAssembly\)\. Fitted to [\d,]+ cells of marked floor, scatter [\d.]+% of depth\./,
    { timeout: 60_000 },
  );
  expect(fetched.some((url) => /models\/depth/.test(url))).toBe(true);
  // Objects' own latency readout is still the detector's, not the map's.
  const mapMs = Number(
    (await status.textContent())!.match(/made in (\d+) ms/)![1],
  );
  await expect(latency).toHaveText(/^\d+ ms$/);
  expect(
    Number((await latency.textContent())!.replace(" ms", "")),
  ).toBeLessThan(mapMs);
  await expect(page.getByRole("alert")).toHaveCount(0);

  // At least one box has a distance with a bar; its row says "box" for sizes.
  await expect(measuredRows.first()).toContainText(/[\d.]+ ± [\d.]+ m away/);
  const detail = page.getByTestId("measure-detail");
  await expect(detail).toContainText("Select a box in the list above");
  await measuredRows.first().click();
  await expect(detail).toContainText(/^Distance: [\d.]+ ± [\d.]+ m\./);
  await expect(detail).toContainText("allowance of 11%");
  await expect(detail).toContainText("not measured on this picture");
  await expect(detail.locator("p")).toHaveCount(3);
  await expect(detail.locator("p").nth(1)).toContainText(/^Box width: /);
  await expect(detail.locator("p").nth(2)).toContainText(/^Box height: /);
  // Every row that mentions a size calls it the box's.
  for (const text of await rows.allTextContents())
    if (/ wide| tall/.test(text)) expect(text).toMatch(/· box [\d.]/);

  // The session export carries the readings of the frames made since.
  await expect
    .poll(
      async () => {
        const download = page.waitForEvent("download");
        await page.getByRole("button", { name: "Export session" }).click();
        const session = JSON.parse(
          await readFile((await (await download).path())!, "utf8"),
        );
        return session.frames.at(-1).measured ?? null;
      },
      { timeout: 60_000, intervals: [1500] },
    )
    .toMatchObject({
      metric: true,
      offFloorAllowance: 0.11,
      map: { delegate: "CPU" },
      objects: expect.arrayContaining([
        expect.objectContaining({
          distance: {
            value: expect.any(Number),
            error: expect.any(Number),
            unit: "m",
          },
        }),
      ]),
    });

  // The Library says how many boxes have a distance.
  await panel(page, "Library").click();
  await expect(
    page.getByRole("heading", { name: "Library", level: 2 }),
  ).toBeVisible();
  await expect(page.getByTestId("library-measured")).toContainText(
    /^Measured objects: \d+ of \d+ box(es)? in the latest frame ha(s|ve) a distance\./,
  );

  // A moving picture gets no number at all, and the page says why.
  await panel(page, "Inspect").click();
  await expect(status).toHaveAttribute("data-state", "ready");
  await page.getByRole("button", { name: "Try motion demo" }).click();
  await expect(status).toHaveAttribute("data-state", "waiting");
  await expect(status).toContainText("this is a camera or a video");
  await expect(page.getByTestId("measure-detail")).toHaveCount(0);
  await expect(rows.first()).toBeVisible();
  await page.waitForTimeout(1500);
  await expect(measuredRows).toHaveCount(0);
  expect((await rows.allTextContents()).join(" ")).not.toMatch(/measured/);

  // Off again: the status line goes.
  await button.click();
  await expect(status).toHaveCount(0);
  expect(errors).toEqual([]);
});
