/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// Counts workers, so one the scorecard leaves behind shows up as a number.
async function prepare(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test then deals with whatever is shown. */
    }
    // Six pictures hold 21 labelled objects, one over the fewest a figure is
    // stated for. `gpu` lets the GPU box stay ticked where there is no GPU.
    const count = { alive: 0 };
    Object.assign(window, {
      spectraWorkers: count,
      __spectraScoreTest: { pictures: 6, gpu: true },
    });
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        count.alive++;
      }
      terminate() {
        count.alive--;
        super.terminate();
      }
    };
  });
}
const alive = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { spectraWorkers: { alive: number } })
        .spectraWorkers.alive,
  );
const results = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { __spectraResults: { count: number } })
        .__spectraResults.count,
  );

test("the scorecard asks for no picture before Run, then scores a shortened run and refuses a GPU that is not there", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const asked: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.includes("/eval/")) asked.push(path.split("/eval/")[1]);
  });
  await prepare(page);
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  const card = page.getByTestId("scorecard");
  await expect(card.getByRole("heading", { name: "Scorecard" })).toBeVisible();
  // Before the list is read the page states neither count nor size.
  await expect(card).toContainText("against a set of labelled photographs");
  await expect(card).not.toContainText("16.4 MB");
  expect(asked).toEqual([]);
  const before = await alive(page);

  await card.getByLabel(/EfficientDet-Lite2/).uncheck();
  await card.getByRole("button", { name: "Run scorecard" }).click();
  await expect(card.getByTestId("score-progress")).toHaveText(
    "Finished 2 runs.",
    { timeout: 240_000 },
  );
  expect(asked).toContain("set.json");
  expect(new Set(asked.filter((file) => file.endsWith(".jpg"))).size).toBe(6);
  await expect(card).toContainText("100 labelled photographs");
  await expect(card).toContainText("(16.4 MB)");

  const rows = card.getByTestId("score-results").locator("tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator("th")).toContainText("on CPU");
  for (let cell = 0; cell < 5; cell++)
    await expect(rows.nth(0).locator("td").nth(cell)).toHaveText(/\d/);
  await expect(rows.nth(0).locator("td").nth(0)).toHaveText(/^\d+% \(/);
  // No GPU in this browser: the row says so and nothing ran in its place.
  await expect(rows.nth(1).locator("th")).toContainText(
    "did not run: GPU not available:",
  );
  await expect(rows.nth(1).locator("td")).toHaveText(
    Array(5).fill("not measured"),
  );
  await expect(card.getByTestId("score-caption")).toContainText(
    "A spot check on 6 photographs holding 21 labelled objects, not a benchmark result.",
  );
  await expect(card.getByTestId("score-caption")).toContainText(
    "(shortened test run: 6 of 100 pictures)",
  );
  await expect(card).toContainText(
    "They are not comparable with the AP column.",
  );

  // The viewer steps, lists what it draws and credits the photograph.
  await expect(card.getByTestId("score-place")).toHaveText("Picture 1 of 6");
  await card.getByRole("button", { name: "Next" }).click();
  await expect(card.getByTestId("score-place")).toHaveText("Picture 2 of 6");
  const counts = (await card.getByTestId("score-counts").textContent()) ?? "",
    [hits, misses, falses] = (counts.match(/\d+/g) ?? []).map(Number),
    lines = await card
      .getByTestId("score-items")
      .locator("li")
      .allTextContents();
  expect(counts).toMatch(
    /^\d+ hits, \d+ misses, \d+ false boxes at Confidence \d+%$/,
  );
  expect(lines.filter((line) => !line.startsWith("not counted"))).toHaveLength(
    hits + misses + falses,
  );
  await expect(
    card.getByTestId("score-credit").locator("a").first(),
  ).toHaveAttribute("href", /^https:\/\/www\.flickr\.com\/photos\//);
  await expect(card.getByTestId("score-credit")).toContainText(
    "CC BY 2.0, shown unchanged.",
  );

  // The scorecard's worker is gone and the stage is working again.
  expect(await alive(page)).toBe(before);
  const seen = await results(page);
  await expect
    .poll(() => results(page), { timeout: 30_000 })
    .toBeGreaterThan(seen);
});
