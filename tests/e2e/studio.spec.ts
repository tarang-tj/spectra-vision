import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("animated samples drive real tracking; constellation recordings decode and release capture tracks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const captures: MediaStream[] = [];
    Object.assign(window, { spectraCaptures: captures });
    const capture = HTMLCanvasElement.prototype.captureStream;
    HTMLCanvasElement.prototype.captureStream = function (fps) {
      const stream = capture.call(this, fps);
      captures.push(stream);
      return stream;
    };
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("button", { name: "Try motion demo" }).click();
  await ready(page);
  await expect(page.locator(".hud-badge").first()).toHaveText("ANIMATED DEMO");
  await page.waitForTimeout(1800);
  const data = await session(page);
  const positions = data.frames.flatMap(
    (frame: { detections: { label: string; box: { x: number } }[] }) =>
      frame.detections.filter((d) => d.label === "person").map((d) => d.box.x),
  );
  expect(positions.length).toBeGreaterThan(2);
  expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(
    0.005,
  );
  await page.getByRole("switch", { name: "Constellation" }).click();
  await expect(
    page.getByRole("switch", { name: "Constellation" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Record canvas" }).click();
  await expect(page.locator(".recording-badge")).toContainText("REC");
  await page.waitForTimeout(1400);
  const download = page.waitForEvent("download");
  // A mode change automatically finalizes the clip from the previous session.
  await page.getByRole("button", { name: "Body", exact: true }).click();
  const clip = await download;
  expect(clip.suggestedFilename()).toMatch(/^spectra-objects-.*\.(webm|mp4)$/);
  const bytes = await readFile((await clip.path())!);
  expect(bytes.length).toBeGreaterThan(1000);
  const dimensions = await page.evaluate(
    async ({ bytes, mime }) => {
      const url = URL.createObjectURL(
        new Blob([new Uint8Array(bytes)], { type: mime }),
      );
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await video.play();
      const dimensions = [video.videoWidth, video.videoHeight];
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      return dimensions;
    },
    {
      bytes: Array.from(bytes),
      mime: clip.suggestedFilename().endsWith("mp4")
        ? "video/mp4"
        : "video/webm",
    },
  );
  expect(dimensions.every((v) => v > 0)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as unknown as { spectraCaptures: MediaStream[] }
        ).spectraCaptures.flatMap((s) =>
          s.getTracks().map((t) => t.readyState),
        ),
      ),
    )
    .toEqual(["ended"]);
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Record canvas" }),
  ).toBeVisible();
});

async function ready(page: Page) {
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function session(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export session" }).click();
  const path = await (await download).path();
  return JSON.parse(await readFile(path!, "utf8"));
}
test("real object inference, controls, filtered results and usable exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle("SPECTRA — Reality, augmented.");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Reality, augmented.",
  );
  await ready(page);
  await expect(
    page.locator(".detection-row").filter({ hasText: "person" }),
  ).toBeVisible();
  const stage = await page.locator(".camera-stage").boundingBox(),
    rail = await page.locator(".inspector").boundingBox();
  expect(stage!.x + stage!.width).toBeLessThanOrEqual(rail!.x);
  await expect(
    page.getByRole("button", { name: "Export session" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Pause detection" }).click();
  await expect(page.getByTestId("fps")).toHaveText("0.0 fps");
  const data = await session(page);
  expect(data.mode).toBe("objects");
  expect(data.source).toBe("demo");
  expect(data.frames.length).toBeGreaterThan(0);
  expect(
    data.frames
      .at(-1)
      .detections.some((d: { label: string }) => d.label === "person"),
  ).toBe(true);
  expect(JSON.stringify(data)).not.toContain("data:image");
  await page.getByRole("button", { name: "Mirror", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Mirror", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.locator(".detection-row").first().click();
  await expect(page.locator(".detection-row").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const shot = page.waitForEvent("download");
  await page.getByRole("button", { name: "Screenshot", exact: true }).click();
  const shotPath = await (await shot).path();
  expect((await readFile(shotPath!)).subarray(0, 8).toString("hex")).toBe(
    "89504e470d0a1a0a",
  );
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(true);
  await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => !!document.fullscreenElement))
    .toBe(false);
  await page.getByRole("button", { name: "Resume detection" }).click();
  await page.locator("#confidence").fill("0.95");
  await expect(page.locator("output")).toHaveText("95%");
  await expect
    .poll(async () => {
      const current = await session(page);
      return current.frames
        .at(-1)
        .detections.every((d: { score: number }) => d.score >= 0.95);
    })
    .toBe(true);
  await page
    .getByRole("button", { name: "About privacy and controls" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your view stays yours." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close help" }).click();
  expect(errors).toEqual([]);
});
test("body and hand models return actual landmarks; pinch controls and source resets work", async ({
  page,
}) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await ready(page);
  await expect(page.locator(".detection-row")).toContainText("33 landmarks");
  await page.getByRole("button", { name: "Pause detection" }).click();
  const body = await session(page);
  expect(body.frames.at(-1).landmarks[0]).toHaveLength(33);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  await expect(page.locator(".playback")).toContainText("Demo hands");
  await expect(page.getByTestId("tracked")).toHaveText("2");
  await page.getByRole("button", { name: "Pause detection" }).click();
  const hands = await session(page);
  expect(hands.mode).toBe("hands");
  expect(hands.frames.at(-1).landmarks).toHaveLength(2);
  expect(
    hands.frames.at(-1).landmarks.every((p: unknown[]) => p.length === 21),
  ).toBe(true);
  await expect(
    page.locator(".detection-row").filter({ hasText: "Pinching" }),
  ).toHaveCount(1);
  // Hand landmarks carry a default visibility of zero; they must still render.
  await expect
    .poll(() =>
      page.evaluate((points) => {
        const canvas = document.querySelector("canvas")!,
          ctx = canvas.getContext("2d")!;
        const scale = Math.min(canvas.width / 1586, canvas.height / 992),
          w = 1586 * scale,
          h = 992 * scale;
        const p = points[0][0],
          x = Math.round((canvas.width - w) / 2 + p.x * w),
          y = Math.round((canvas.height - h) / 2 + p.y * h);
        const pixels = ctx.getImageData(x - 2, y - 2, 5, 5).data;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i + 1] > pixels[i] + 20 && pixels[i + 2] > pixels[i] + 20)
            return true;
        return false;
      }, hands.frames.at(-1).landmarks),
    )
    .toBe(true);
  await page.getByRole("switch", { name: "Trails" }).click();
  await expect(page.getByRole("switch", { name: "Trails" })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("switch", { name: "Trails" }).click();
  await page.getByRole("button", { name: "Clear light trails" }).click();
  await expect(page.locator(".toast")).toHaveText("Light trails cleared.");
  await page.getByRole("button", { name: "Use demo image" }).click();
  await ready(page);
  await expect(
    page.getByRole("button", { name: "Pause detection" }),
  ).toBeVisible();
});
test("camera acquisition, pause, mode changes, upload and stop release the correct stream", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const streams: MediaStream[] = [];
    Object.assign(window, { spectraTestStreams: streams });
    const get = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (c) => {
      const s = await get(c);
      streams.push(s);
      return s;
    };
  });
  const state = () =>
    page.evaluate(() =>
      (
        window as unknown as { spectraTestStreams: MediaStream[] }
      ).spectraTestStreams.map((s) => s.getVideoTracks()[0].readyState),
    );
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await expect.poll(state).toEqual(["live"]);
  await ready(page);
  await page.getByRole("button", { name: "Pause detection" }).click();
  expect(await state()).toEqual(["live"]);
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await ready(page);
  expect(await state()).toEqual(["live"]);
  await page
    .getByLabel("Upload image or video")
    .setInputFiles(resolve("public/demo/studio.png"));
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await expect.poll(state).toEqual(["ended"]);
  await ready(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("button", { name: "Stop camera" })).toBeVisible();
  await page.getByRole("button", { name: "Stop camera" }).click();
  await expect.poll(state).toEqual(["ended", "ended"]);
  await expect(page.locator(".hud-badge").first()).toHaveText("DEMO IMAGE");
  await ready(page);
});
test("camera denial recovers to demo, and the mobile layout stays inside its viewport", async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied", "NotAllowedError");
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  await page.getByRole("button", { name: "Start camera" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Camera permission was denied",
  );
  await page.getByRole("button", { name: "Try demo", exact: true }).click();
  await ready(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready(page);
  await expect(page.getByTestId("tracked")).toHaveText("2");
});
test("a local video is decoded, looped, inferred and paused without uploading its media", async ({
  page,
}) => {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
  const bytes = await page.evaluate(async () => {
    const image = new Image();
    image.src = new URL("demo/studio.png", location.href).href;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, 640, 400);
    const stream = canvas.captureStream(10),
      recorder = new MediaRecorder(stream, {
        mimeType: "video/webm;codecs=vp8",
      }),
      chunks: Blob[] = [];
    const done = new Promise<number[]>((resolve) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () =>
        resolve(
          Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer())),
        );
    });
    recorder.start();
    let tick = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = "#10191c";
      ctx.fillRect(0, 0, 640, 400);
      ctx.drawImage(image, Math.sin(tick++ / 6) * 10, 0, 640, 400);
    }, 100);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    clearInterval(timer);
    recorder.stop();
    const output = await done;
    stream.getTracks().forEach((t) => t.stop());
    return output;
  });
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.method() !== "GET") requests.push(r.method() + " " + r.url());
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "motion.webm",
    mimeType: "video/webm",
    buffer: Buffer.from(bytes),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL VIDEO");
  await ready(page);
  await expect(
    page.locator(".detection-row").filter({ hasText: "person" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Number(
        (await page.getByTestId("fps").innerText()).replace("fps", "").trim(),
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause detection" }).click();
  await expect(page.getByTestId("fps")).toHaveText("0.0 fps");
  const data = await session(page);
  expect(data.source).toBe("video");
  expect(data.frames.length).toBeGreaterThan(1);
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Use demo image" }).click();
  await expect(page.locator(".hud-badge").first()).toHaveText("DEMO IMAGE");
  await ready(page);
});
