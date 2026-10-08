/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const production = process.env.SPECTRA_TEST_PRODUCTION === "1";

async function ready(page: Page) {
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
const pressed = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Vision mode" })
    .getByRole("button", { name, exact: true });
const tips = (page: Page) =>
  page.getByRole("group", { name: "Getting started tips" });
/** Names of the stage's own controls and labels that the tips card overlaps. */
const coveredByTips = (page: Page) =>
  page.evaluate(() => {
    const card = document.querySelector(".coach")!.getBoundingClientRect(),
      covered: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(
      ".camera-stage button, .camera-stage .hud-badge, .camera-stage .playback span",
    )) {
      if (el.closest(".coach")) continue;
      const box = el.getBoundingClientRect();
      if (
        box.width &&
        box.left < card.right &&
        box.right > card.left &&
        box.top < card.bottom &&
        box.bottom > card.top
      )
        covered.push(el.getAttribute("aria-label") || el.innerText.trim());
    }
    return covered;
  });

test("shortcuts switch modes and drive the stage, but never while typing", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const modes = await page
    .getByRole("navigation", { name: "Vision mode" })
    .getByRole("button")
    .allInnerTexts();
  expect(modes.slice(0, 3)).toEqual(["Objects", "Body", "Hands"]);
  // Every registered mode is reachable by its number key.
  for (let i = modes.length - 1; i >= 0; i--) {
    await page.keyboard.press(String(i + 1));
    await expect(pressed(page, modes[i])).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  }
  // A digit past the last mode does nothing.
  await page.keyboard.press(String(Math.min(9, modes.length + 1)));
  await expect(pressed(page, "Objects")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await ready(page);

  // M mirrors, E closes and reopens the tray and moves focus into it.
  const mirror = page.getByRole("button", { name: "Mirror", exact: true });
  await page.keyboard.press("m");
  await expect(mirror).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("m");
  await expect(mirror).toHaveAttribute("aria-pressed", "false");
  const trails = page.getByRole("switch", { name: "Trails" });
  await expect(trails).toBeVisible();
  await page.keyboard.press("e");
  await expect(trails).toBeHidden();
  await page.keyboard.press("e");
  await expect(trails).toBeFocused();

  // ? opens help, which documents the shortcuts and the local cache.
  await page.keyboard.press("?");
  const help = page.locator("#help");
  await expect(help).toContainText("clear this site’s data");
  await expect(help.locator("dt")).toHaveCount(8);
  await page.keyboard.press("?");
  await expect(help).toHaveCount(0);

  // The palette owns the keyboard while open: typed digits and letters are
  // text, not shortcuts.
  await page.keyboard.press("Control+k");
  const field = page.getByRole("combobox", { name: "Search commands" });
  await expect(field).toBeFocused();
  await page.keyboard.type("2mre");
  await expect(field).toHaveValue("2mre");
  await expect(pressed(page, "Objects")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(mirror).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".recording-badge")).toHaveCount(0);
  await page.keyboard.press("Tab");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The slider is not a text field: shortcuts still work with it focused.
  await page.locator("#confidence").focus();
  await page.keyboard.press("2");
  await expect(pressed(page, "Body")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("1");
  await ready(page);

  // S saves a real PNG.
  const shot = page.waitForEvent("download");
  await page.keyboard.press("s");
  const shotPath = await (await shot).path();
  expect((await readFile(shotPath!)).subarray(0, 8).toString("hex")).toBe(
    "89504e470d0a1a0a",
  );

  // R records; R again stops, saves the clip and shows the share card.
  await page.keyboard.press("r");
  await expect(page.locator(".recording-badge")).toContainText("REC");
  await page.waitForTimeout(1300);
  const clip = page.waitForEvent("download");
  await page.keyboard.press("r");
  expect((await clip).suggestedFilename()).toMatch(
    /^spectra-objects-.*\.(webm|mp4)$/,
  );
  const card = page.getByRole("region", { name: "Your result" });
  await expect(card).toContainText("Objects clip saved");
  await expect
    .poll(() =>
      card
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.videoWidth > 0 && v.duration > 0),
    )
    .toBe(true);
  await card.getByRole("button", { name: "Copy link to SPECTRA" }).click();
  await expect(page.locator(".toast")).toHaveText("Link copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    new URL("./", page.url()).href,
  );
  await card.getByRole("button", { name: "Dismiss result" }).click();
  await expect(card).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("coach marks appear once, block nothing and are remembered", async ({
  page,
}) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const card = tips(page);
  await expect(card).toContainText("Tip 1 of 3");
  // Not modal: focus is left alone and the rest of the studio still works.
  expect(
    await page.evaluate(
      () => !document.activeElement?.closest(".coach") && !document.body.inert,
    ),
  ).toBe(true);
  // Hands has the fullest stage toolbar (it adds Clear).
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  await expect(card).toContainText("Tip 1 of 3");
  expect(await coveredByTips(page)).toEqual([]);
  await expect(page.getByRole("navigation", { name: "Vision mode" })).toHaveCSS(
    "outline-style",
    "solid",
  );
  await card.getByRole("button", { name: "Next tip" }).click();
  await expect(card).toContainText("Tip 2 of 3");
  expect(await coveredByTips(page)).toEqual([]);
  await expect(page.getByRole("navigation", { name: "Vision mode" })).toHaveCSS(
    "outline-style",
    "none",
  );
  await card.getByRole("button", { name: "Next tip" }).click();
  await expect(card).toContainText("Tip 3 of 3");
  expect(await coveredByTips(page)).toEqual([]);
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(tips(page)).toHaveCount(0);
  // The palette can bring them back on request.
  await page.getByRole("button", { name: "Open command palette" }).click();
  await page.keyboard.type("getting started");
  await page.keyboard.press("Enter");
  await expect(tips(page)).toContainText("Tip 1 of 3");
});

test("on a phone the tips sit under the stage and focus follows the page", async ({
  page,
}) => {
  // 360 px is the narrowest common phone; the stage is 246 px tall there.
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  const card = tips(page);
  for (const tip of [1, 2, 3]) {
    await expect(card).toContainText(`Tip ${tip} of 3`);
    expect(await coveredByTips(page)).toEqual([]);
    const stage = await page.locator(".camera-stage").boundingBox(),
      box = await card.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height);
    expect(box!.x + box!.width).toBeLessThanOrEqual(360);
    if (tip < 3) await card.getByRole("button", { name: "Next tip" }).click();
  }
  // Reading order top to bottom: stage, tips, effects tray, inspector,
  // metrics. Keyboard focus must visit them in that same order.
  const order = await page.evaluate(() => {
    const blocks = [
      ".camera-stage",
      ".coach",
      ".deck",
      ".inspector",
      ".metrics",
    ];
    const focusable = [
      ...document.querySelectorAll<HTMLElement>(
        "main button:not(:disabled), main input, main select, main a[href]",
      ),
    ].filter((el) => el.getBoundingClientRect().width > 0);
    const visited: string[] = [];
    for (const el of focusable) {
      const block = blocks.find((selector) => el.closest(selector));
      if (block && visited.at(-1) !== block) visited.push(block);
    }
    const tops = blocks.map(
      (selector) =>
        document.querySelector(selector)!.getBoundingClientRect().top,
    );
    return { visited, tops };
  });
  expect(order.visited).toEqual([
    ".camera-stage",
    ".coach",
    ".deck",
    ".inspector",
    ".metrics",
  ]);
  expect([...order.tops].sort((a, b) => a - b)).toEqual(order.tops);
  // And by the keyboard itself: Tab leaves the stage's last tool for the
  // tips, and the tips for the effects tray.
  await page.getByRole("button", { name: "Fullscreen" }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest(".coach")),
  ).toBe(true);
  await card.getByRole("button", { name: "Close tips" }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest(".deck")),
  ).toBe(true);
  await card.getByRole("button", { name: "Got it" }).click();
  await page.getByRole("button", { name: "Immersive" }).focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest(".inspector")),
  ).toBe(true);
});

test("the command palette runs registry commands and returns focus", async ({
  page,
}) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const opener = page.getByRole("button", { name: "Open command palette" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog.getByRole("option").first()).toHaveAttribute(
    "aria-selected",
    "true",
  );
  // Escape closes it and hands focus back to where it came from.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.keyboard.press("Control+k");
  await page.keyboard.type("hand tracking");
  await expect(dialog.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(pressed(page, "Hands")).toHaveAttribute("aria-pressed", "true");
  await ready(page);
  // An effect toggled from the palette is the same switch as in the tray.
  await page.keyboard.press("Control+k");
  await page.keyboard.type("constellation");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("switch", { name: "Constellation" }),
  ).toHaveAttribute("aria-checked", "true");
  // Clicking outside closes it too.
  await page.keyboard.press("Control+k");
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});

test("the immersive view fills the viewport, toggles off and leaves the page scrollable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const stage = page.locator(".camera-stage");
  const before = await stage.boundingBox();
  expect(before!.width / before!.height).toBeCloseTo(1.6, 1);
  await page.evaluate(() => window.scrollTo(0, 120));
  await page.getByRole("button", { name: "Immersive" }).click();
  await expect
    .poll(async () => {
      const box = await stage.boundingBox();
      return [box!.x, box!.y, box!.width, box!.height];
    })
    .toEqual([0, 0, 1280, 720]);
  const dock = page.getByRole("toolbar", { name: "Immersive view" });
  await expect(dock).toBeVisible();
  await expect(page.locator(".inspector")).toBeHidden();
  await expect(page.getByRole("heading", { level: 1 })).toBeHidden();
  // The dock changes mode and reaches the effects without leaving the view.
  await dock.getByRole("combobox", { name: "Vision mode" }).selectOption({
    label: "Hands",
  });
  await ready(page);
  await expect(page.locator(".mode-badge")).toHaveText(/hand tracking/i);
  await dock.getByRole("button", { name: "Effects" }).click();
  await dock.getByRole("switch", { name: "Constellation" }).click();
  await expect(
    dock.getByRole("switch", { name: "Constellation" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("button", { name: "Pause detection" }),
  ).toBeVisible();
  // Escape leaves; the page is laid out again and scrolls as before.
  await page.keyboard.press("Escape");
  await expect(dock).toHaveCount(0);
  await expect(page.locator(".inspector")).toBeVisible();
  const after = await stage.boundingBox();
  expect(after!.width).toBe(before!.width);
  expect(after!.height).toBe(before!.height);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(120);
  expect(
    await page.evaluate(() => {
      const locked = (el: Element) =>
        ["hidden", "clip"].includes(getComputedStyle(el).overflowY);
      window.scrollTo(0, 0);
      window.scrollTo(0, 60);
      return (
        !locked(document.documentElement) &&
        !locked(document.body) &&
        window.scrollY === 60
      );
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "Immersive" }).click();
  await dock.getByRole("button", { name: "Exit" }).click();
  await expect(dock).toHaveCount(0);
});

test("at 390 px nothing scrolls sideways, no control is clipped and all are 40 px tall", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  // Hands adds the Clear tool: the fullest toolbar the stage can have.
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  await page
    .getByRole("button", { name: "About privacy and controls" })
    .click();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  const problems = await page.evaluate(() => {
    const found: string[] = [];
    const controls = document.querySelectorAll<HTMLElement>(
      "main button, main select, main input[type=range], main label.button, main a.icon-button",
    );
    for (const el of controls) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const name =
        el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName;
      if (box.height < 39.5) found.push(`${name}: ${box.height}px tall`);
      if (box.left < -0.5 || box.right > innerWidth + 0.5)
        found.push(`${name}: outside the viewport`);
      // Clipped by a scrolling or hidden-overflow ancestor (the stage).
      for (let up = el.parentElement; up; up = up.parentElement) {
        if (getComputedStyle(up).overflowX === "visible") continue;
        const outer = up.getBoundingClientRect();
        if (box.left < outer.left - 0.5 || box.right > outer.right + 0.5)
          found.push(`${name}: clipped by ${up.className}`);
      }
    }
    return found;
  });
  expect(problems).toEqual([]);
  // The effects tray sits directly under the stage, above the inspector.
  const tray = await page.locator(".deck").boundingBox(),
    stage = await page.locator(".camera-stage").boundingBox(),
    rail = await page.locator(".inspector").boundingBox();
  expect(tray!.y).toBeGreaterThanOrEqual(stage!.y + stage!.height);
  expect(rail!.y).toBeGreaterThanOrEqual(tray!.y + tray!.height);
});

test("the rail matches the stage, tabs follow the registry and the tray hides effects that cannot draw", async ({
  page,
}) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const stage = page.locator(".camera-stage"),
    rail = page.locator(".inspector");
  const tabs = page.getByRole("navigation", { name: "Inspector panel" });
  const names = (await tabs.count())
    ? await tabs.getByRole("button").allInnerTexts()
    : ["Inspect"];
  expect(names[0]).toBe("Inspect");
  // Whatever panel is open, the stage stays 16:10 and the rail its height.
  for (const name of names) {
    if (names.length > 1)
      await tabs.getByRole("button", { name, exact: true }).click();
    const s = await stage.boundingBox(),
      r = await rail.boundingBox();
    expect(s!.width / s!.height).toBeCloseTo(1.6, 2);
    expect(Math.abs(r!.height - s!.height)).toBeLessThanOrEqual(1);
  }
  // The footer names the registered modes, not a fixed three.
  const modes = await page
    .getByRole("navigation", { name: "Vision mode" })
    .getByRole("button")
    .allInnerTexts();
  for (const mode of modes)
    await expect(page.locator("main > footer")).toContainText(mode);
  // Trails follows objects, bodies and hands. In a mode that tracks none of
  // them its switch is gone; Constellation, which works anywhere, stays.
  await expect(page.getByRole("switch", { name: "Trails" })).toBeVisible();
  test.skip(!modes.includes("Face"), "No Face mode is registered.");
  await page.getByRole("button", { name: "Face", exact: true }).click();
  await expect(page.locator(".mode-badge")).not.toHaveText(/object/i);
  await expect(page.getByRole("switch", { name: "Trails" })).toHaveCount(0);
  await expect(
    page.getByRole("switch", { name: "Constellation" }),
  ).toBeVisible();
});

test("a denied camera gets its own error state with a way forward", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Camera access is blocked.");
  await expect(alert).toContainText("Camera permission was denied");
  await expect(alert).toContainText("set Camera to Allow");
  // The first-run tips step aside for the error.
  await expect(tips(page)).toHaveCount(0);
  await expect(
    alert.getByRole("button", { name: "Retry camera" }),
  ).toBeVisible();
  await alert.getByRole("button", { name: "Try demo", exact: true }).click();
  await ready(page);
  await expect(tips(page)).toBeVisible();
});

test("the service worker registers only in production and caches models on demand", async ({
  page,
}) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    /manifest\.webmanifest$/,
  );
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    return (await fetch(link!.href)).json();
  });
  expect(manifest.short_name).toBe("SPECTRA");
  expect(manifest.start_url).toBe("./");
  if (!production) {
    // A development server must never be controlled by a service worker.
    await page.waitForTimeout(1500);
    expect(
      await page.evaluate(async () => [
        (await navigator.serviceWorker.getRegistrations()).length,
        (await caches.keys()).filter((key) => key.startsWith("spectra-")),
      ]),
    ).toEqual([0, []]);
    return;
  }
  const cached = (name: RegExp) =>
    page.evaluate(async (source) => {
      const found: string[] = [];
      for (const key of await caches.keys())
        for (const request of await (await caches.open(key)).keys())
          if (new RegExp(source).test(request.url)) found.push(key);
      return found;
    }, name.source);
  // The production build is served under the project path, as on the live
  // site, and the worker's scope is exactly that folder.
  expect(new URL(page.url()).pathname).toBe("/spectra-vision/");
  const worker = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return {
      script: registration.active!.scriptURL,
      scope: registration.scope,
    };
  });
  const script = worker.script;
  expect(worker.scope).toBe(new URL("./", page.url()).href);
  expect(script).toBe(
    new URL("./sw.js", page.url()).href + new URL(script).search,
  );
  // The version is the content hash of the entry script this page loaded.
  const version = new URL(script).searchParams.get("v")!;
  expect(version).toMatch(/^[\w-]{6,}$/);
  expect(
    await page.evaluate(() =>
      [...document.scripts].map((entry) => entry.src).join(" "),
    ),
  ).toContain(`-${version}.js`);
  const shell = `spectra-shell-${version}`;
  // First visit, nothing clicked. The shell, the MediaPipe runtime and the one
  // model that ran are stored, although all of them were fetched before the
  // worker took control. Models that were never used are not.
  await expect.poll(() => cached(/\/spectra-vision\/$/)).toEqual([shell]);
  await expect.poll(() => cached(/assets\/.*\.js$/)).toEqual([shell]);
  await expect.poll(() => cached(/assets\/.*\.css$/)).toEqual([shell]);
  await expect.poll(() => cached(/vision-worker\.js$/)).toEqual([shell]);
  await expect.poll(() => cached(/demo\/studio\.png$/)).toEqual([shell]);
  for (const file of [
    /models\/efficientdet_lite0\.tflite$/,
    /runtime\/vision_bundle\.js$/,
    /runtime\/wasm\/vision_wasm[\w]*_internal\.js$/,
    /runtime\/wasm\/vision_wasm[\w]*_internal\.wasm$/,
  ])
    await expect.poll(() => cached(file)).toEqual(["spectra-assets-v1"]);
  const unused = [
    /models\/hand_landmarker\.task$/,
    /models\/pose_landmarker/,
    /models\/face_landmarker/,
    /models\/selfie_multiclass/,
    /models\/gesture_recognizer/,
    /\.(mp4|webm)$/,
  ];
  for (const file of unused) expect(await cached(file)).toEqual([]);
  // Offline, that first-visit page reloads and runs its model again.
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Reality, augmented.",
  );
  await ready(page);
  // The network really is down for the service worker too: a model that was
  // never used cannot be fetched, so nothing above came from the network.
  expect(
    await page.evaluate(() =>
      fetch("models/pose_landmarker_lite.task").then(
        (response) => response.status,
        () => "failed",
      ),
    ),
  ).toBe("failed");
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/model|worker/i);
  // Back online, a second mode loads, and only then is its model stored.
  await page.context().setOffline(false);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  await expect
    .poll(() => cached(/models\/hand_landmarker\.task$/))
    .toEqual(["spectra-assets-v1"]);
  expect(await cached(/models\/pose_landmarker/)).toEqual([]);
  await page.context().setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  await expect(page.locator(".detection-row")).toHaveCount(2);
  await page.context().setOffline(false);
});
