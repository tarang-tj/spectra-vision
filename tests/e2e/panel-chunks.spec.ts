/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// The Lab, Library, Ruler and Presence panels are fetched when their tab is
// first opened (src/panels/shared/lazy-panel.tsx). These tests hold the entry
// script to its size, and check that a panel arrives when asked, opens offline
// after one visit, and says so with a working retry when it cannot be fetched.
const production = process.env.SPECTRA_TEST_PRODUCTION === "1";
/** The most the first paint may have to parse: the script the page names plus
 * the chunks that script imports at once. v2.5.0 was one script of 671,230
 * bytes. */
const ENTRY_LIMIT = 540_000;
const RULER_STEP = "Tap three or more points along an edge";
/** Each on-demand panel with words only its own body shows. */
const PANELS = [
  [
    "Lab",
    "Measured in this browser, on this device. Nothing is sent anywhere.",
  ],
  ["Library", "The names the Objects models can give."],
  ["Ruler", "Lay a sheet of known size flat on the surface"],
  ["Presence", "Presence reads the body, hand and face models together"],
] as const;

const tab = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
const body = (page: Page) => page.locator(".panel-body");

async function open(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test then deals with what is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
}

type Built = { entry: string; preloaded: string[]; onDemand: string[] };
/** The scripts and styles the built page names, by how it names them. */
async function built(page: Page): Promise<Built> {
  const html = await (await page.request.get(page.url())).text(),
    hrefs = (rel: string) =>
      [...html.matchAll(/<link\b[^>]*>/g)]
        .filter((tag) => new RegExp(`rel="${rel}"`).test(tag[0]))
        .map((tag) => /href="([^"]+)"/.exec(tag[0])![1])
        .filter((href) => /\.(js|css)$/.test(href));
  return {
    entry: /<script type="module"[^>]* src="([^"]+)"/.exec(html)![1],
    preloaded: hrefs("modulepreload"),
    onDemand: hrefs("prefetch"),
  };
}
const text = async (page: Page, path: string) => {
  const response = await page.request.get(new URL(path, page.url()).href);
  expect(response.status(), path).toBe(200);
  return response.text();
};

test("the entry script stays under its limit and holds no panel body", async ({
  page,
}) => {
  test.skip(!production, "sizes are those of the production bundle");
  await open(page);
  const { entry, preloaded, onDemand } = await built(page),
    first = await Promise.all(
      [entry, ...preloaded].map((path) => text(page, path)),
    ),
    bytes = first.map((file) => Buffer.byteLength(file));
  expect(bytes[0]).toBeGreaterThan(100_000);
  expect(bytes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(
    ENTRY_LIMIT,
  );
  // What the first paint parses says nothing a panel body says.
  for (const [, words] of PANELS)
    expect(first.some((file) => file.includes(words))).toBe(false);
  expect(first.some((file) => file.includes(RULER_STEP))).toBe(false);
  // The bodies exist, each in a file fetched on demand.
  const later = await Promise.all(
    onDemand
      .filter((path) => path.endsWith(".js"))
      .map((path) => text(page, path)),
  );
  for (const [name, words] of PANELS)
    expect(
      later.filter((file) => file.includes(words)),
      name,
    ).toHaveLength(1);
});

test("a panel's script is run when its tab is first pressed, and the panel shows", async ({
  page,
}) => {
  await open(page);
  // Nothing has asked for the Ruler's body as a script yet.
  const scripts: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "script") scripts.push(request.url());
  });
  await expect(tab(page, "Inspect")).toHaveAttribute("aria-pressed", "true");
  const arrives = page.waitForResponse(
    async (response) =>
      response.request().resourceType() === "script" &&
      (await response.text().catch(() => "")).includes(RULER_STEP),
  );
  await tab(page, "Ruler").click();
  const response = await arrives;
  expect(scripts).toContain(response.url());
  await expect(page.getByTestId("ruler-step")).toBeVisible();
  await expect(body(page)).toContainText(PANELS[2][1]);
  await expect(page.getByRole("alert")).toHaveCount(0);
  // Loaded once: coming back shows the panel with no second fetch.
  const fetched = scripts.length;
  await tab(page, "Inspect").click();
  await tab(page, "Ruler").click();
  await expect(page.getByTestId("ruler-step")).toBeVisible();
  expect(scripts).toHaveLength(fetched);
});

test("after one visit every panel opens with no network", async ({
  page,
  context,
}) => {
  test.skip(!production, "only the production bundle has a service worker");
  test.setTimeout(240_000);
  await open(page);
  const { entry, preloaded, onDemand } = await built(page);
  expect(onDemand.length).toBeGreaterThanOrEqual(PANELS.length);
  // The worker has stored every script and style the page names, although no
  // panel tab was pressed.
  await page.evaluate(() => navigator.serviceWorker.ready);
  const stored = () =>
    page.evaluate(
      async (paths) => {
        const missing: string[] = [];
        for (const path of paths)
          if (
            !(await caches.match(new URL(path, location.href).href, {
              ignoreVary: true,
            }))
          )
            missing.push(path);
        return missing;
      },
      [entry, ...preloaded, ...onDemand],
    );
  await expect.poll(stored, { timeout: 60_000 }).toEqual([]);
  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
    // The network really is down, for the service worker too.
    expect(
      await page.evaluate(() =>
        fetch("models/pose_landmarker_lite.task").then(
          (response) => response.status,
          () => "failed",
        ),
      ),
    ).toBe("failed");
    for (const [name, words] of PANELS) {
      await tab(page, name).click();
      await expect(body(page)).toContainText(words);
      await expect(page.getByRole("alert")).toHaveCount(0);
    }
  } finally {
    await context.setOffline(false);
  }
});

test.describe("a panel that cannot be fetched", () => {
  // A request the service worker answers cannot be held or failed from here.
  test.use({ serviceWorkers: "block" });

  test("says it is loading, then that it could not be loaded, and Try again fetches it", async ({
    page,
  }) => {
    await open(page);
    // The Ruler's body: one hashed file in the bundle, one module in
    // development.
    let chunk = /\/src\/panels\/ruler\/panel\.tsx/;
    if (production) {
      const { onDemand } = await built(page);
      for (const path of onDemand.filter((file) => file.endsWith(".js")))
        if ((await text(page, path)).includes(RULER_STEP))
          chunk = new RegExp(path.replace(/[.\\/]/g, "\\$&") + "$");
    }
    let release = () => {},
      held = 0;
    const gate = new Promise<void>((resolve) => (release = resolve));
    await page.route(chunk, async (route) => {
      held++;
      await gate;
      await route.abort("connectionfailed");
    });
    await tab(page, "Ruler").click();
    const loading = body(page).getByRole("status");
    await expect(loading).toHaveText("Loading the Ruler panel…");
    await expect(page.getByRole("alert")).toHaveCount(0);
    // The request is out and unanswered: that is what the line stands for.
    await expect.poll(() => held).toBeGreaterThanOrEqual(1);
    release();
    const alert = page.getByTestId("panel-load-fault");
    await expect(alert).toHaveAttribute("role", "alert");
    await expect(alert.locator("p")).toHaveText(
      "The Ruler panel could not be loaded. Check your connection and try again, or reload the page.",
    );
    // The fault is the panel's alone: the stage and the other tabs go on.
    await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
    await tab(page, "Inspect").click();
    await expect(alert).toHaveCount(0);
    await tab(page, "Ruler").click();
    await expect(alert).toBeVisible();
    // With the file reachable again, Try again fetches it and the Ruler shows.
    await page.unroute(chunk);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("ruler-step")).toBeVisible();
    await expect(body(page)).toContainText(PANELS[2][1]);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("fetches a stylesheet that failed again too, so the panel comes back styled", async ({
    page,
  }) => {
    test.skip(!production, "only the bundle has a stylesheet per panel");
    await open(page);
    const { onDemand } = await built(page);
    let sheet = "";
    for (const path of onDemand.filter((file) => file.endsWith(".css")))
      if ((await text(page, path)).includes(".ruler-step")) sheet = path;
    expect(sheet).not.toBe("");
    const address = new RegExp(sheet.replace(/[.\\/]/g, "\\$&") + "$");
    await page.route(address, (route) => route.abort("connectionfailed"));
    await tab(page, "Ruler").click();
    const alert = page.getByTestId("panel-load-fault");
    await expect(alert).toBeVisible();
    await page.unroute(address);
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByTestId("ruler-step")).toBeVisible();
    // The Ruler's own rules are in force, not only its markup: its step line
    // is set in weight 600 by ruler.css and by nothing else.
    await expect(page.getByTestId("ruler-step")).toHaveCSS(
      "font-weight",
      "600",
    );
    await expect
      .poll(() =>
        page.evaluate(
          (href) =>
            [...document.styleSheets].filter((styles) =>
              styles.href?.endsWith(href),
            ).length,
          sheet,
        ),
      )
      .toBe(1);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
