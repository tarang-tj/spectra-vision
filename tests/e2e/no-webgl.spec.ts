/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// A browser with no WebGL2 at all (3D APIs switched off): the studio must
// still track, and must say plainly that the GPU effects are unavailable.

/** Console errors and page errors. MediaPipe writes its own "INFO:" start-up
 * lines to console.error from the worker; those are not errors. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^INFO: /.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}
async function ready(page: Page) {
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
// The configured browser, started with every 3D API switched off: neither the
// page nor a worker can get a WebGL context of any version.
test.use({
  launchOptions: async ({ launchOptions }, use) => {
    await use({
      ...launchOptions,
      args: [
        ...(launchOptions.args ?? []).filter((arg) => !/angle/.test(arg)),
        "--disable-3d-apis",
      ],
    });
  },
});
test("the stage works and GPU effects are shown as unavailable", async ({
  page,
}) => {
  const errors = watchErrors(page),
    warnings: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "warning" && /WebGL2/.test(message.text()))
      warnings.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem("spectra.coach.v1", "1"));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  expect(
    await page.evaluate(
      () => !document.createElement("canvas").getContext("webgl2"),
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  // The notice is on the page, and a GPU effect cannot be switched on.
  await expect(page.locator(".deck")).toContainText(
    "GPU effects need WebGL2, which this browser does not provide.",
  );
  const plasma = page.getByRole("switch", { name: "Plasma hands" });
  await expect(plasma).toBeDisabled();
  await expect(plasma).toHaveAttribute("aria-checked", "false");
  // The command palette lists the effect too: asking for it there says why
  // it cannot start, and it stays off.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("plasma hands");
  await page.keyboard.press("Enter");
  await expect(page.locator(".toast")).toHaveText(
    "Plasma hands needs WebGL2, which is not available.",
  );
  await expect(plasma).toHaveAttribute("aria-checked", "false");
  // Canvas effects are not affected.
  const constellation = page.getByRole("switch", { name: "Constellation" });
  await constellation.click();
  await expect(constellation).toHaveAttribute("aria-checked", "true");
  // The stage keeps producing results and can still be captured.
  const first = await page.getByTestId("latency").innerText();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const canvas = document.querySelector("canvas")!,
          data = canvas
            .getContext("2d")!
            .getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let i = 0; i < data.length; i += 400) if (data[i] > 60) lit++;
        return lit;
      }),
    )
    .toBeGreaterThan(50);
  expect(first).toMatch(/^\d+ ms$/);
  await expect(page.locator(".detection-row").first()).toBeVisible();
  await expect(page.getByText(/hit an error/)).toHaveCount(0);
  expect(warnings).toHaveLength(1);
  expect(errors).toEqual([]);
});
