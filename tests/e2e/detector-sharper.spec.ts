/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// Objects' Sharper model, chosen on an earlier visit. It needs a real GPU
// and WebGPU. This suite's Chromium has neither (SwiftShader), so here the
// test proves the other half: Objects runs the MediaPipe detector, fetches
// nothing for Sharper and says in one line why. Where a real GPU is present
// (a Chrome started without --disable-gpu) the same test follows the model
// itself. scripts/detector-check.mjs is the manual check of that path.

type Last = {
  tasks: Record<string, { model: string | null; delegate: string }>;
} | null;
const last = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __spectraResults: { last: Last } })
        .__spectraResults.last,
  );
const rows = (page: Page, label: string) =>
  page.locator(".detection-row").filter({ hasText: label });

test("Sharper chosen: runs D-FINE on a real GPU, and on any other device runs the standard model and says so", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors: string[] = [],
    fetched: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (request) => {
    if (/detector-worker\.js|dfine_s_coco\.onnx/.test(request.url()))
      fetched.push(request.url());
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
      localStorage.setItem("spectra.sharper.v1", "on");
    } catch {
      /* Storage blocked: the test then fails on what it expects. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Objects", exact: true }).click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/, {
    timeout: 120_000,
  });
  const choice = page.getByRole("button", { name: "Sharper (GPU)" }),
    line = page.getByTestId("object-sharper");

  const gpu = (await choice.count()) > 0;
  // Which half ran, for whoever reads the run's output.
  test.info().annotations.push({
    type: "sharper",
    description: gpu ? "ran on a real GPU" : "no GPU: fallback line checked",
  });
  if (gpu) {
    // A real GPU with WebGPU: the model itself, on the demo still.
    await expect(choice).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await last(page))?.tasks.object?.model, {
        timeout: 120_000,
      })
      .toBe("dfine_s_coco.onnx");
    expect((await last(page))?.tasks.object.delegate).toBe("GPU");
    // Its class names are the ones the rest of the app uses.
    for (const label of ["person", "chair", "dining table", "potted plant"])
      await expect(rows(page, label).first()).toBeVisible({ timeout: 60_000 });
    await expect(line).not.toContainText("not running");
    console.log(
      `Sharper on a real GPU: ${await page.getByTestId("latency").textContent()} a result, rows: ${(await page.locator(".detection-row").allTextContents()).join(" | ")}`,
    );
    expect(fetched.some((url) => url.endsWith("detector-worker.js"))).toBe(
      true,
    );
    // Switched off, the MediaPipe detector takes over again.
    await choice.click();
    await expect
      .poll(async () => (await last(page))?.tasks.object?.model, {
        timeout: 120_000,
      })
      .toMatch(/^efficientdet_lite\d\.tflite$/);
  } else {
    // No GPU here: the choice is not offered, and one line says what runs.
    await expect(line).toHaveText(
      "Sharper is not running: Objects is on CPU here. The standard model is running instead.",
    );
    await expect
      .poll(async () => (await last(page))?.tasks.object?.model, {
        timeout: 90_000,
      })
      .toBe("efficientdet_lite0.tflite");
    expect((await last(page))?.tasks.object.delegate).toBe("CPU");
    await expect(rows(page, "person")).toHaveCount(1, { timeout: 90_000 });
    // Nothing of Sharper's was fetched for a device that cannot run it.
    expect(fetched).toEqual([]);
  }
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);

  // Both of its files are part of what is served, for the devices that can.
  const worker = await page.request.get("./detector-worker.js"),
    model = await page.request.head("./models/dfine_s_coco.onnx");
  expect(worker.status()).toBe(200);
  expect(await worker.text()).toContain("detectorInternals");
  expect(model.status()).toBe(200);
  expect(Number(model.headers()["content-length"])).toBe(41_535_197);
});

test("Sharper not chosen: nothing is said about it and nothing of it is fetched", async ({
  page,
}) => {
  const fetched: string[] = [];
  page.on("request", (request) => {
    if (/detector-worker\.js|dfine_s_coco\.onnx/.test(request.url()))
      fetched.push(request.url());
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test then fails on what it expects. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Objects", exact: true }).click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/, {
    timeout: 120_000,
  });
  await expect(page.getByTestId("object-model")).toBeVisible();
  await expect(page.getByText("not running")).toHaveCount(0);
  await expect
    .poll(async () => (await last(page))?.tasks.object?.model, {
      timeout: 90_000,
    })
    .toMatch(/^efficientdet_lite\d\.tflite$/);
  expect(fetched).toEqual([]);
});
