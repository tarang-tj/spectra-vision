/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// What the stage does with a picture that does not change, with a model that
// cannot be fetched, and with Depth on a moving clip. Real models, on the
// CPU path (this suite's browser has no GPU, like CI).

type Probed = {
  __spectraResults?: { count: number };
  __spectraDepth?: {
    last(): {
      min: number;
      max: number;
      width: number;
      height: number;
      content: { x: number; y: number; width: number; height: number } | null;
      over: string;
      lag: string;
    } | null;
    at(x: number, y: number): number | null;
  };
};
const production = process.env.SPECTRA_TEST_PRODUCTION === "1";
const mode = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Vision mode" })
    .getByRole("button", { name, exact: true });
const panel = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
const results = (page: Page) =>
  page.evaluate(() => (window as Probed).__spectraResults!.count);
const depth = (page: Page) =>
  page.evaluate(() => (window as Probed).__spectraDepth?.last() ?? null);
/** Results that arrive in `ms`. */
async function arriving(page: Page, ms: number) {
  const before = await results(page);
  await page.waitForTimeout(ms);
  return (await results(page)) - before;
}
async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  return errors;
}
const fps = (page: Page) => page.getByTestId("fps");
const note = (page: Page) => page.getByTestId("fps-note");

test("a still picture is checked once a second, says so, and runs again at once for a setting, a resume and the Lab", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page);
  // The demo still: after its first few results the readout stops giving a
  // rate and says what is happening instead.
  await expect(fps(page)).toHaveText("still picture");
  await expect(note(page)).toHaveText("checked once a second");
  // The boxes found in the full-rate run are still tracked and listed.
  await expect(
    page.locator(".detection-row").filter({ hasText: "person" }),
  ).toBeVisible();
  // One a second, not fifteen: 6 s gives about 6.
  const resting = await arriving(page, 6000);
  expect(resting).toBeGreaterThanOrEqual(4);
  expect(resting).toBeLessThanOrEqual(8);

  // A setting: the full-rate run again, straight away (4 results), not the
  // one a second it would otherwise get.
  const before = await results(page);
  await page.locator("#confidence").fill("0.6");
  await expect
    .poll(async () => (await results(page)) - before, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(4);
  await expect(fps(page)).toHaveText("still picture");

  // Paused: nothing. Resumed: a run again.
  await page.getByRole("button", { name: "Pause detection" }).click();
  await expect(fps(page)).toHaveText("0.0 fps");
  await expect(note(page)).toHaveCount(0);
  await page.waitForTimeout(600);
  expect(await arriving(page, 2500)).toBe(0);
  const paused = await results(page);
  await page.getByRole("button", { name: "Resume detection" }).click();
  await expect
    .poll(async () => (await results(page)) - paused, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(4);

  // The Lab measures over time, so it keeps the model running and the
  // readout says who asked: a real rate again, well above one a second.
  await panel(page, "Lab").click();
  await expect(note(page)).toHaveText("kept running for the Lab");
  await expect(fps(page)).toHaveText(/^\d+\.\d fps$/);
  await page.waitForTimeout(1500);
  const measuring = await arriving(page, 4000);
  expect(measuring).toBeGreaterThan(resting);
  expect(measuring).toBeGreaterThanOrEqual(10);
  expect(Number.parseFloat(await fps(page).innerText())).toBeGreaterThan(2);
  // Lab closed: left alone again.
  await panel(page, "Inspect").click();
  await expect(fps(page)).toHaveText("still picture");
  await expect(note(page)).toHaveText("checked once a second");

  // A clip is never paced: it has a rate and no note.
  await page.getByRole("button", { name: "Try motion demo" }).click();
  await expect(fps(page)).toHaveText(/^\d+\.\d fps$/);
  await expect(note(page)).toHaveCount(0);
  expect(await arriving(page, 3000)).toBeGreaterThanOrEqual(8);
  expect(errors).toEqual([]);
});

test("Depth infers a still picture once, then only when the picture changes", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  await mode(page, "Depth").click();
  await expect.poll(() => depth(page), { timeout: 120_000 }).not.toBeNull();
  await expect(fps(page)).toHaveText("still picture");
  await expect(note(page)).toHaveText("inferred once");
  await expect(page.locator(".detection-row")).toHaveCount(6);
  // No map after the first, for longer than five of them would take.
  expect(await arriving(page, 6000)).toBe(0);
  // Drawing settings change nothing the model would see.
  const quiet = await results(page);
  await page.getByLabel("Depth map opacity").fill("0.4");
  await page.getByRole("button", { name: "3D view" }).click();
  await page.getByRole("button", { name: "Depth map", exact: true }).click();
  await page.waitForTimeout(2500);
  expect(await results(page)).toBe(quiet);
  // A new picture is inferred, once.
  await page.getByRole("button", { name: "Use demo image" }).click();
  await expect.poll(() => depth(page), { timeout: 60_000 }).not.toBeNull();
  await expect(fps(page)).toHaveText("still picture");
  const again = await results(page);
  expect(again).toBeGreaterThan(quiet);
  await page.waitForTimeout(4000);
  expect(await results(page)).toBe(again);
  // The demo still has no bars: the whole map is picture, drawn over it.
  expect(await depth(page)).toMatchObject({ content: null, over: "live" });
  await expect(page.getByTestId("depth-held")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Depth on a moving clip draws each map over the frame it came from, and leaves the clip's bars alone", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const errors = await open(page);
  await mode(page, "Depth").click();
  await expect.poll(() => depth(page), { timeout: 120_000 }).not.toBeNull();
  await page.getByRole("button", { name: "Try motion demo" }).click();
  await expect(page.locator(".hud-badge").first()).toHaveText("ANIMATED DEMO");
  await expect
    .poll(async () => (await depth(page))?.over, { timeout: 90_000 })
    .toBe("held");
  await expect(page.getByTestId("depth-held")).toContainText(
    "the stage shows the frame each map was made from",
  );
  // The legend's line: how far behind live the picture and its map are,
  // with the bar the page states for it.
  const last = (await depth(page))!;
  expect(last.lag).toMatch(
    /^Picture and map: \d+\.\d0 ± 0\.10 s behind live\.$/,
  );

  // The clip is a photo panned inside dark bars. The picture's cells are
  // named, and the bars are outside them on the left and the right.
  const content = last.content!;
  expect(content).not.toBeNull();
  expect(content.x).toBeGreaterThan(10);
  expect(content.x + content.width).toBeLessThan(last.width - 10);
  // The model does call the bar near (that was the yellow frame): its value
  // there is outside the range the map is coloured by.
  const bar = await page.evaluate(
    () => (window as Probed).__spectraDepth!.at(0.004, 0.5)!,
  );
  expect(bar).toBeGreaterThan(last.max);

  // On the canvas: a point in the left bar keeps the clip's own dark colour
  // (it was bright yellow), while the picture beside it is painted.
  const pixels = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
          ".camera-stage canvas",
        )!,
        ctx = canvas.getContext("2d")!,
        // The clip is 1024 x 640, letterboxed in the canvas.
        scale = Math.min(canvas.width / 1024, canvas.height / 640),
        left = (canvas.width - 1024 * scale) / 2,
        top = (canvas.height - 640 * scale) / 2,
        at = (x: number, y: number) => [
          ...ctx
            .getImageData(
              Math.round(left + x * 1024 * scale),
              Math.round(top + y * 640 * scale),
              1,
              1,
            )
            .data.slice(0, 3),
        ];
      // Away from the legend and the stage's own buttons.
      return { bar: at(0.01, 0.6), picture: at(0.5, 0.6) };
    });
  const seen = await pixels();
  expect(Math.max(...seen.bar)).toBeLessThan(60);
  expect(Math.max(...seen.picture)).toBeGreaterThan(90);

  // The picture under the map is held: between two maps the stage does not
  // move, though the clip itself plays on (a map takes about a second here).
  const fingerprint = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>(
          ".camera-stage canvas",
        )!,
        // The middle of the picture, clear of the legend, whose own line
        // counts the tenths of a second.
        data = canvas
          .getContext("2d")!
          .getImageData(
            Math.round(canvas.width * 0.3),
            Math.round(canvas.height * 0.35),
            Math.round(canvas.width * 0.6),
            Math.round(canvas.height * 0.4),
          ).data;
      let sum = 0;
      for (let i = 0; i < data.length; i += 64)
        sum = (sum * 31 + data[i] + data[i + 1]) >>> 0;
      return {
        sum,
        count: (window as Probed).__spectraResults!.count,
        clip: document.querySelector("video")?.currentTime ?? null,
      };
    });
  let pair: { a: number; b: number } | null = null;
  for (let attempt = 0; attempt < 40 && !pair; attempt++) {
    const first = await fingerprint();
    await page.waitForTimeout(120);
    const second = await fingerprint();
    // Compared only when no new map arrived in between.
    if (second.count === first.count) pair = { a: first.sum, b: second.sum };
  }
  expect(pair).not.toBeNull();
  expect(pair!.b).toBe(pair!.a);

  // With the map fully clear there is nothing to keep in step: the live
  // clip shows, and it moves.
  await page.getByLabel("Depth map opacity").fill("0");
  await expect
    .poll(async () => {
      const first = await fingerprint();
      await page.waitForTimeout(120);
      const second = await fingerprint();
      return second.count === first.count && second.sum !== first.sum;
    })
    .toBe(true);
  expect(errors).toEqual([]);
});

test("offline, a mode never opened says the device is offline and the model is not on it, and works after a retry online", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors = await open(page),
    warnings: string[] = [],
    failed: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "warning" && m.text().includes("[spectra"))
      warnings.push(m.text());
  });
  page.on("requestfailed", (r) => {
    if (/models\/pose_landmarker/.test(r.url())) failed.push(r.url());
  });
  await context.setOffline(true);
  await mode(page, "Body").click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("You are offline.");
  await expect(alert).toContainText(
    "This device is offline, and this mode's model is not stored on it yet. Go online once to download it; after that it works offline.",
  );
  await expect(alert).not.toContainText(/GPU|Failed to fetch/);
  await expect(alert).not.toContainText("get you seeing");
  // One attempt at the model, and nothing in the console blaming a delegate.
  expect(failed.length).toBeLessThanOrEqual(1);
  expect(warnings.filter((w) => /GPU failed|using CPU/.test(w))).toEqual([]);

  await context.setOffline(false);
  await alert.getByRole("button", { name: "Retry model" }).click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/, {
    timeout: 90_000,
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator(".detection-row")).toContainText("33 landmarks");
  expect(errors).toEqual([]);
});

test("Depth says the size of its model while it downloads for the first time", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  // Hold the model back for a moment so the loading line can be read.
  await context.route(
    /models\/depth_anything_v2_small\.onnx$/,
    async (route) => {
      await new Promise((done) => setTimeout(done, 2500));
      await route.continue();
    },
  );
  const errors = await open(page);
  // Every text the stage's loading notice shows, in order.
  await page.evaluate(() => {
    const shown: string[] = [];
    Object.assign(window, { spectraLoading: shown });
    new MutationObserver(() => {
      const text = document.querySelector(
        ".camera-stage .loading",
      )?.textContent;
      if (text && shown.at(-1) !== text) shown.push(text);
    }).observe(document.querySelector(".camera-stage")!, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
  const shown = () =>
    page.evaluate(
      () => (window as unknown as { spectraLoading: string[] }).spectraLoading,
    );
  await mode(page, "Depth").click();
  const loading = page.locator(".camera-stage .loading");
  await expect(loading).toContainText(
    "Downloading this mode's model: 99 MB, one time",
  );
  // Kept afterwards only where a service worker will keep it.
  if (production)
    await expect(loading).toContainText("It is kept on this device afterwards");
  else await expect(loading).not.toContainText("kept on this device");
  await expect.poll(() => depth(page), { timeout: 120_000 }).not.toBeNull();
  // The size was said once, in one line.
  const first = (await shown()).filter((text) => text.includes("MB"));
  expect(new Set(first).size).toBe(1);
  expect(first[0].match(/MB/g)).toHaveLength(1);

  // Another mode's small model gets the plain line, with no size.
  await mode(page, "Body").click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/, {
    timeout: 90_000,
  });
  // Depth again, now stored on the device (production keeps it): no size.
  if (production) {
    const before = (await shown()).length;
    await mode(page, "Depth").click();
    await expect.poll(() => depth(page), { timeout: 120_000 }).not.toBeNull();
    const later = (await shown()).slice(before);
    expect(later.some((text) => text.includes("MB"))).toBe(false);
    expect(later.join(" ")).toContain("Loading model");
  }
  expect((await shown()).some((text) => text === "Loading model…")).toBe(true);
  expect(errors).toEqual([]);
});
