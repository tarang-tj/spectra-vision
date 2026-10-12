/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Starting, choosing and losing a camera, as a person sees it. The cameras
// are stand-ins (tests/helpers/stand-in-cameras.ts): this shows what the app
// does with a front and a rear camera, not what a real phone does.
import { test, expect, type Page } from "@playwright/test";
import {
  BACK,
  FRONT,
  PHONE,
  WIDE,
  bench,
  picture,
  standInCameras,
} from "../helpers/stand-in-cameras";

declare global {
  interface Window {
    standIn: import("../helpers/stand-in-cameras").Bench;
  }
}

const open = async (page: Page) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.locator(".hud-badge").first()).toHaveText("DEMO IMAGE");
};
const startButton = (page: Page) =>
  page.getByRole("button", { name: "Start camera" });
const start = (page: Page) => startButton(page).click();
const badge = (page: Page) => page.locator(".hud-badge").first();
const side = (page: Page, name: "Front" | "Rear") =>
  page.getByRole("group", { name: "Camera" }).getByRole("button", { name });
const mirror = (page: Page) =>
  page.getByRole("button", { name: "Mirror", exact: true });
const alert = (page: Page) => page.getByRole("alert");
const toast = (page: Page) => page.locator(".toast");
const red = (page: Page) => async () => (await picture(page)).red;
const lastAsked = (page: Page) => bench(page, (b) => b.calls.at(-1)!.video);
const liveTracks = (page: Page) =>
  bench(page, (b) => b.tracks.filter((t) => t.readyState === "live").length);

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("Rear can be chosen before the camera starts, and the rear picture is not mirrored", async ({
    page,
  }) => {
    await standInCameras(page);
    await open(page);
    // Offered before any permission: it needs no camera names.
    await expect(side(page, "Rear")).toBeVisible();
    await expect(side(page, "Front")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Camera source")).toHaveCount(0);
    await side(page, "Rear").click();
    await expect(side(page, "Rear")).toHaveAttribute("aria-pressed", "true");
    // Choosing only sets what Start camera will ask for.
    expect(await bench(page, (b) => b.calls.length)).toBe(0);
    await start(page);
    await expect(badge(page)).toHaveText("CAMERA · REAR · 720×1280");
    await expect(page.locator(".playback")).toContainText("Back Camera");
    await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(red(page)).toBe("left");
    // The front camera is a mirror, as a person expects of a selfie view.
    await side(page, "Front").click();
    await expect(badge(page)).toHaveText("CAMERA · FRONT · 720×1280");
    await expect(mirror(page)).toHaveAttribute("aria-pressed", "true");
    await expect.poll(red(page)).toBe("right");
    await expect(alert(page)).toHaveCount(0);
  });

  test("a portrait picture fills a portrait stage, and the controls are thumb sized", async ({
    page,
  }) => {
    await standInCameras(page);
    await open(page);
    const before = (await page.locator(".camera-stage").boundingBox())!;
    await side(page, "Rear").click();
    await start(page);
    await expect.poll(red(page)).toBe("left");
    const stage = (await page.locator(".camera-stage").boundingBox())!,
      shown = await picture(page);
    expect(stage.height).toBeGreaterThan(before.height * 1.5);
    // 720x1280 was 150x267 px on this screen when the stage stayed 4:3.
    expect(shown.width).toBeGreaterThanOrEqual(250);
    expect(shown.height).toBeGreaterThanOrEqual(440);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const control of [
      page.getByRole("button", { name: "Flip camera" }),
      side(page, "Front"),
      side(page, "Rear"),
      page.getByLabel("Camera source"),
    ]) {
      const box = (await control.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // Every stage tool is still inside the stage with the flip added.
    const tools = (await page.locator(".stage-tools").boundingBox())!;
    expect(tools.x).toBeGreaterThanOrEqual(stage.x);
    expect(tools.x + tools.width).toBeLessThanOrEqual(stage.x + stage.width);
    // The phone turns: the badge and the stage follow the new shape.
    await bench(page, (b) => b.turn());
    await expect(badge(page)).toHaveText("CAMERA · REAR · 1280×720");
    await expect
      .poll(async () =>
        Math.round((await page.locator(".camera-stage").boundingBox())!.height),
      )
      .toBe(Math.round(before.height));
    await expect.poll(red(page)).toBe("left");
  });

  test("the Flip tool goes to the other side and back, releasing each camera it leaves", async ({
    page,
  }) => {
    await standInCameras(page, [FRONT, BACK]);
    await open(page);
    await start(page);
    await expect(badge(page)).toContainText("FRONT");
    const flip = page.getByRole("button", { name: "Flip camera" });
    await flip.click();
    await expect(badge(page)).toContainText("REAR");
    await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(red(page)).toBe("left");
    await flip.click();
    await expect(badge(page)).toContainText("FRONT");
    await expect.poll(red(page)).toBe("right");
    expect(await bench(page, (b) => b.tracks.length)).toBe(3);
    expect(await liveTracks(page)).toBe(1);
    await page.getByRole("button", { name: "Stop camera" }).click();
    await expect(badge(page)).toHaveText("DEMO IMAGE");
    expect(await liveTracks(page)).toBe(0);
    await expect(flip).toHaveCount(0);
  });

  test("the chosen camera survives Stop and a reload", async ({ page }) => {
    await standInCameras(page);
    await open(page);
    await side(page, "Rear").click();
    await start(page);
    await expect(badge(page)).toContainText("REAR");
    await page.getByLabel("Camera source").selectOption("wide-id");
    await expect(page.locator(".playback")).toContainText("Back Ultra Wide");
    await page.getByRole("button", { name: "Stop camera" }).click();
    await start(page);
    await expect(page.locator(".playback")).toContainText("Back Ultra Wide");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(badge(page)).toHaveText("DEMO IMAGE");
    // Remembered, and shown before the camera is started.
    await expect(side(page, "Rear")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Camera source")).toHaveValue("wide-id");
    await start(page);
    await expect(page.locator(".playback")).toContainText("Back Ultra Wide");
    await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
    await expect(toast(page)).toHaveCount(0);
  });

  test("a remembered camera that has gone gives way to one on the same side, and says so", async ({
    page,
  }) => {
    await standInCameras(page);
    await open(page);
    await side(page, "Rear").click();
    await start(page);
    await page.getByLabel("Camera source").selectOption("wide-id");
    await expect(page.locator(".playback")).toContainText("Back Ultra Wide");
    await page.getByRole("button", { name: "Stop camera" }).click();
    await bench(page, (b) => b.unplug("wide-id"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(badge(page)).toHaveText("DEMO IMAGE");
    await start(page);
    await expect(toast(page)).toHaveText(
      "The camera used last time is not available. Using Back Camera.",
    );
    await expect(badge(page)).toContainText("REAR");
    await expect(alert(page)).toHaveCount(0);
    await expect.poll(red(page)).toBe("left");
  });
});

test("picking a camera that has gone comes back to the live one and says so", async ({
  page,
}) => {
  await standInCameras(page);
  await open(page);
  await start(page);
  const list = page.getByLabel("Camera source");
  await expect(list.locator("option")).toHaveCount(3);
  await list.selectOption("back-id");
  await expect(badge(page)).toContainText("REAR");
  // Unplugged without the browser saying so: the list is stale.
  await bench(page, (b) => b.unplug("wide-id", true));
  await list.selectOption("wide-id");
  await expect(toast(page)).toHaveText(
    "That camera is not available. Back on Back Camera.",
  );
  await expect(badge(page)).toContainText("REAR");
  await expect(list).toHaveValue("back-id");
  await expect(alert(page)).toHaveCount(0);
  await expect.poll(red(page)).toBe("left");
  // The list was read again after the start, so the dead entry is gone.
  await expect(list.locator("option")).toHaveCount(2);
  expect(await liveTracks(page)).toBe(1);
});

test("the camera list follows cameras that are plugged in and pulled out", async ({
  page,
}) => {
  await standInCameras(page, [FRONT, BACK]);
  await open(page);
  await start(page);
  const options = page.getByLabel("Camera source").locator("option");
  await expect(options).toHaveText(["Front Camera", "Back Camera"]);
  await bench(page, (b) =>
    b.plug({
      deviceId: "usb-id",
      label: "USB Camera",
      width: 1280,
      height: 720,
    }),
  );
  await expect(options).toHaveText([
    "Front Camera",
    "Back Camera",
    "USB Camera",
  ]);
  await bench(page, (b) => b.unplug("back-id"));
  await expect(options).toHaveText(["Front Camera", "USB Camera"]);
  // Pulling out the live camera says so, and Retry starts another.
  await bench(page, (b) => b.unplug("front-id"));
  await expect(alert(page)).toContainText("The camera went away.");
  await expect(badge(page)).toHaveText("NO SOURCE");
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
  await alert(page).getByRole("button", { name: "Retry camera" }).click();
  await expect(badge(page)).toHaveText("CAMERA · 1280×720");
  await expect(alert(page)).toHaveCount(0);
});

const FAILURES = [
  {
    name: "a site block",
    fail: { name: "NotAllowedError", message: "Permission denied" },
    permission: "denied",
    title: "Camera access is blocked.",
    says: "set Camera to Allow",
    retry: "Retry camera",
  },
  {
    name: "a closed prompt",
    fail: { name: "NotAllowedError", message: "Dismissed", afterMs: 900 },
    permission: "prompt",
    title: "The camera prompt was closed.",
    says: "got no answer",
    retry: "Ask again",
  },
  {
    name: "a system block",
    fail: { name: "NotAllowedError", message: "Permission denied by system" },
    permission: "granted",
    title: "Your device is blocking the camera.",
    says: "system privacy settings",
    retry: "Retry camera",
  },
  {
    name: "a refusal the browser does not explain",
    fail: { name: "NotAllowedError", message: "Denied" },
    permission: "granted",
    title: "Camera access is blocked.",
    says: "though this site is allowed",
    retry: "Retry camera",
  },
  {
    name: "no camera",
    fail: { name: "NotFoundError", message: "Requested device not found" },
    permission: "prompt",
    title: "No camera found.",
    says: "Connect one",
    retry: "Retry camera",
  },
  {
    name: "a busy camera",
    fail: { name: "NotReadableError", message: "Could not start video" },
    permission: "granted",
    title: "The camera is in use.",
    says: "Another app or tab",
    retry: "Retry camera",
  },
  {
    name: "a failure with no message",
    fail: { name: "SecurityError", message: "" },
    permission: "granted",
    title: "The camera did not start.",
    says: "The browser reported: SecurityError.",
    retry: "Retry camera",
  },
] as const;

for (const failure of FAILURES)
  test(`${failure.name} has its own words on the stage`, async ({ page }) => {
    await standInCameras(page, PHONE, { permission: failure.permission });
    await open(page);
    await page.evaluate(
      (fail) => Object.assign(window.standIn, { fail }),
      failure.fail,
    );
    await start(page);
    await expect(alert(page).locator("strong")).toHaveText(failure.title);
    await expect(alert(page)).toContainText(failure.says);
    // The heading is said once, not again as the sentence under it.
    const text = (await alert(page).textContent())!;
    expect(text.split(failure.title).length).toBe(2);
    await expect(alert(page).getByRole("button")).toHaveText([
      failure.retry,
      "Try demo",
    ]);
    await expect(badge(page)).toHaveText("NO SOURCE");
    await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
    await expect(startButton(page)).toBeEnabled();
  });

test("a page with no camera API says it needs HTTPS and offers no retry", async ({
  page,
}) => {
  await standInCameras(page, PHONE, { insecure: true });
  await open(page);
  await start(page);
  await expect(alert(page).locator("strong")).toHaveText(
    "The camera needs a secure page.",
  );
  await expect(alert(page).getByRole("button")).toHaveText(["Try demo"]);
});

test("the error card clears itself when the permission is granted or a camera is plugged in", async ({
  page,
}) => {
  await standInCameras(page, PHONE, { permission: "denied" });
  await open(page);
  await page.evaluate(() =>
    Object.assign(window.standIn, { fail: { name: "NotAllowedError" } }),
  );
  await start(page);
  await expect(alert(page)).toContainText("Camera access is blocked.");
  // Pressing retry while still blocked says that nothing changed.
  await alert(page).getByRole("button", { name: "Retry camera" }).click();
  await expect(toast(page)).toContainText("Still the same.");
  await expect(alert(page)).toContainText("Camera access is blocked.");
  // The person allows the camera in the browser's settings: no press needed.
  await bench(page, (b) => {
    b.fail = null;
    b.setPermission("granted");
  });
  await expect(badge(page)).toContainText("CAMERA · FRONT");
  await expect(alert(page)).toHaveCount(0);
  // The same for a camera that arrives after "No camera found".
  await page.getByRole("button", { name: "Stop camera" }).click();
  await bench(page, (b) => {
    for (const id of ["front-id", "back-id", "wide-id"]) b.unplug(id);
  });
  await start(page);
  await expect(alert(page)).toContainText("No camera found.");
  await bench(page, (b) =>
    b.plug({
      deviceId: "usb-id",
      label: "USB Camera",
      width: 1280,
      height: 720,
    }),
  );
  await expect(badge(page)).toHaveText("CAMERA · 1280×720");
  await expect(alert(page)).toHaveCount(0);
});

test("Retry repeats the request that failed, and a demo that failed never starts the camera", async ({
  page,
}) => {
  await standInCameras(page, PHONE, { permission: "granted" });
  // The demo picture does not arrive.
  await page.route("**/demo/**", (route) => route.abort());
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(alert(page).locator("strong")).toHaveText(
    "The demo did not load.",
  );
  await expect(alert(page).getByRole("button")).toHaveText(["Retry demo"]);
  await page.unroute("**/demo/**");
  await alert(page).getByRole("button", { name: "Retry demo" }).click();
  await expect(badge(page)).toHaveText("DEMO IMAGE");
  expect(await bench(page, (b) => b.calls.length)).toBe(0);
  // A rear camera that is busy: Retry asks for the rear camera again.
  await page.getByRole("group", { name: "Camera" }).waitFor();
  await side(page, "Rear").click();
  await page.evaluate(() =>
    Object.assign(window.standIn, { fail: { name: "NotReadableError" } }),
  );
  await start(page);
  await expect(alert(page)).toContainText("The camera is in use.");
  const asked = await lastAsked(page);
  expect(asked).toMatchObject({ facingMode: { ideal: "environment" } });
  await bench(page, (b) => (b.fail = null));
  await alert(page).getByRole("button", { name: "Retry camera" }).click();
  await expect(badge(page)).toContainText("REAR");
  expect(await lastAsked(page)).toEqual(asked);
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "false");
  await expect.poll(red(page)).toBe("left");
});

test("an unanswered prompt gets a hint and a Cancel that gives the page back", async ({
  page,
}) => {
  await standInCameras(page);
  await open(page);
  await bench(page, (b) => (b.hang = true));
  await start(page);
  const waiting = page.getByRole("status").filter({ hasText: "Waiting" });
  await expect(waiting).toContainText("Look for its prompt");
  await expect(page.getByRole("button", { name: "Opening…" })).toBeDisabled();
  await waiting.getByRole("button", { name: "Cancel" }).click();
  await expect(waiting).toHaveCount(0);
  await expect(startButton(page)).toBeEnabled();
  await expect(alert(page)).toHaveCount(0);
  await expect(page.locator(".camera-stage")).toContainText(
    "Choose your view.",
  );
  // The answer arrives after all: the camera is let go, not shown.
  await bench(page, (b) => {
    b.hang = false;
    b.release();
  });
  await expect
    .poll(() => bench(page, (b) => b.tracks.map((t) => t.readyState)))
    .toEqual(["ended"]);
  await expect(badge(page)).toHaveText("NO SOURCE");
  // And the next press starts a camera as usual.
  await start(page);
  await expect(badge(page)).toContainText("CAMERA · FRONT");
});

test("a camera the system pauses says so, and one lost in a hidden tab comes back", async ({
  page,
}) => {
  await standInCameras(page, [BACK, WIDE]);
  await open(page);
  await start(page);
  await expect(badge(page)).toContainText("REAR");
  const note = page.getByRole("status").filter({ hasText: "paused" });
  await bench(page, (b) => b.tracks[0].dispatchEvent(new Event("mute")));
  await expect(note).toHaveText(
    "Camera paused by the system. It resumes by itself.",
  );
  await bench(page, (b) => b.tracks[0].dispatchEvent(new Event("unmute")));
  await expect(note).toHaveCount(0);
  // The tab is hidden and the system takes the camera.
  const visibility = (state: string) =>
    page.evaluate((s) => {
      Object.defineProperty(document, "visibilityState", {
        value: s,
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    }, state);
  await visibility("hidden");
  await bench(page, (b) => {
    b.tracks[0].stop();
    b.tracks[0].dispatchEvent(new Event("ended"));
  });
  await expect(alert(page)).toContainText("The camera went away.");
  await visibility("visible");
  await expect(badge(page)).toContainText("CAMERA · REAR");
  await expect(alert(page)).toHaveCount(0);
  expect(await liveTracks(page)).toBe(1);
});

test("one webcam on a desk starts mirrored, with its size shown and no camera choice", async ({
  page,
}) => {
  // Chrome's own fake camera: one device that does not say which way it faces.
  await open(page);
  await start(page);
  await expect(badge(page)).toHaveText(/^CAMERA · \d+×\d+$/);
  await expect(mirror(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".camera-picker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Flip camera" })).toHaveCount(
    0,
  );
});
