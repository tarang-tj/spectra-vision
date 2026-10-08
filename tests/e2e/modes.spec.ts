/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

// Each test runs the real model on the mode's own demo input and reads the
// result back from the exported session, the inspector and the canvas.

type Box = { x: number; y: number; w: number; h: number };
type Detection = {
  label: string;
  score: number;
  box: Box;
  share?: number;
  pixels?: number;
};
type Frame = {
  detections: Detection[];
  landmarks: { x: number; y: number }[][];
  handedness: string[];
};
type Session = { mode: string; source: string; frames: Frame[] };

async function open(page: Page, mode: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: mode, exact: true }).click();
  await ready(page);
  return errors;
}
async function ready(page: Page) {
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
async function session(page: Page): Promise<Session> {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export session" }).click();
  const path = await (await download).path();
  return JSON.parse(await readFile(path!, "utf8"));
}
const row = (page: Page, text: string | RegExp) =>
  page.locator(".detection-row").filter({ hasText: text });
/** Mean colour of a small square of the stage canvas around an
 * image-normalized point. `size` is the demo image's pixel size. */
const sample = (page: Page, point: { x: number; y: number }, size: number[]) =>
  page.evaluate(
    ({ point, size }) => {
      const canvas = document.querySelector("canvas")!,
        ctx = canvas.getContext("2d")!,
        scale = Math.min(canvas.width / size[0], canvas.height / size[1]),
        w = size[0] * scale,
        h = size[1] * scale,
        x = Math.round((canvas.width - w) / 2 + point.x * w),
        y = Math.round((canvas.height - h) / 2 + point.y * h),
        pixels = ctx.getImageData(x - 3, y - 3, 7, 7).data;
      let r = 0,
        g = 0,
        b = 0,
        mint = false;
      for (let i = 0; i < pixels.length; i += 4) {
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
        // The mesh is drawn in mint: green and blue well above red.
        if (
          pixels[i + 1] > pixels[i] + 20 &&
          pixels[i + 2] > pixels[i] + 20 &&
          pixels[i + 1] > 150
        )
          mint = true;
      }
      const count = pixels.length / 4;
      return { r: r / count, g: g / count, b: b / count, mint };
    },
    { point, size },
  );
const inside = (box: Box) =>
  box.x >= 0 &&
  box.y >= 0 &&
  box.w > 0 &&
  box.h > 0 &&
  box.x + box.w <= 1.0001 &&
  box.y + box.h <= 1.0001;

test("face: 478 real landmarks, measured expressions and head pose, mesh on the face", async ({
  page,
}) => {
  const errors = await open(page, "Face");
  await expect(page.locator(".playback")).toContainText(
    "Demo studio · portrait crop",
  );
  for (const label of [
    "Smile",
    "Jaw open",
    "Brow raise",
    "Blink left",
    "Blink right",
  ])
    await expect(row(page, label)).toContainText(/[▰▱]{8} \d+%/);
  await expect(row(page, "Head pose")).toContainText(
    /yaw -?\d+° · pitch -?\d+° · roll -?\d+°/,
  );
  await page.getByRole("button", { name: "Pause detection" }).click();
  const data = await session(page);
  expect(data.mode).toBe("face");
  expect(data.source).toBe("demo");
  const face = data.frames.at(-1)!.landmarks;
  expect(face).toHaveLength(1);
  expect(face[0]).toHaveLength(478);
  expect(face[0].every((p) => p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1)).toBe(
    true,
  );
  // Landmark 10 is on the face oval, which is drawn as a glowing contour.
  await expect
    .poll(async () => (await sample(page, face[0][10], [1120, 700])).mint)
    .toBe(true);
  expect(errors).toEqual([]);
});

test("segment: a real mask with per-class pixel counts, and cutouts that follow the selection", async ({
  page,
}) => {
  const errors = await open(page, "Segment");
  await expect(row(page, "Background")).toContainText(/\d+\.\d%/);
  await expect(row(page, "Clothes")).toContainText(/\d+\.\d%/);
  // Nothing selected: the person is isolated, so the wall behind is dark.
  const corner = { x: 0.04, y: 0.06 };
  await expect
    .poll(async () => (await sample(page, corner, [1120, 700])).g)
    .toBeLessThan(70);
  await page.getByRole("button", { name: "Pause detection" }).click();
  const data = await session(page);
  expect(data.mode).toBe("segment");
  const frame = data.frames.at(-1)!,
    classes = frame.detections;
  expect(frame.landmarks).toEqual([]);
  const labels = classes.map((c) => c.label);
  expect(labels).toEqual(expect.arrayContaining(["hair", "clothes"]));
  expect(
    labels.every((label) =>
      ["hair", "body-skin", "face-skin", "clothes", "others"].includes(label),
    ),
  ).toBe(true);
  for (const entry of classes) {
    expect(Number.isInteger(entry.pixels) && entry.pixels! > 0).toBe(true);
    // The mask is 256 x 256: the share is the pixel count over that.
    expect(entry.share).toBeCloseTo(entry.pixels! / (256 * 256), 10);
    expect(entry.score).toBeGreaterThanOrEqual(0.45);
    expect(entry.score).toBeLessThanOrEqual(1);
    expect(inside(entry.box)).toBe(true);
  }
  const person = classes.reduce((sum, c) => sum + c.pixels!, 0);
  expect(person).toBeGreaterThan(256 * 256 * 0.1);
  expect(person).toBeLessThan(256 * 256 * 0.9);
  // The shirt is still there: the middle of the clothes box is blue.
  const clothes = classes.find((c) => c.label === "clothes")!.box,
    shirt = await sample(
      page,
      { x: clothes.x + clothes.w / 2, y: clothes.y + clothes.h * 0.7 },
      [1120, 700],
    );
  expect(shirt.b).toBeGreaterThan(shirt.r + 30);
  // Background selected: it is blurred instead of darkened, so it is light again.
  await row(page, "Background").click();
  await expect(row(page, "Background")).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () => (await sample(page, corner, [1120, 700])).g)
    .toBeGreaterThan(120);
  // Hair selected: tinted lavender, more blue than the brown it covers.
  const hair = classes.find((c) => c.label === "hair")!.box,
    strand = { x: hair.x + hair.w * 0.3, y: hair.y + hair.h * 0.5 };
  await row(page, "Hair").click();
  await expect
    .poll(async () => {
      const color = await sample(page, strand, [1120, 700]);
      return color.b - color.r;
    })
    .toBeGreaterThan(10);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("gestures: hand landmarks, a recognized gesture with its score, and a count of gestures seen", async ({
  page,
}) => {
  const errors = await open(page, "Gestures");
  await expect(page.locator(".playback")).toContainText("Demo hands");
  await expect(row(page, /hand/).first()).toContainText(/Open palm \d+%/);
  // Held for a few results, the gesture is counted once.
  await expect(row(page, "seen once")).toContainText("Open palm");
  await page.getByRole("button", { name: "Pause detection" }).click();
  const data = await session(page);
  expect(data.mode).toBe("gestures");
  const frame = data.frames.at(-1)!;
  expect(frame.landmarks.length).toBeGreaterThan(0);
  expect(frame.landmarks.every((hand) => hand.length === 21)).toBe(true);
  expect(frame.handedness).toHaveLength(frame.landmarks.length);
  expect(frame.detections).toHaveLength(frame.landmarks.length);
  for (const gesture of frame.detections) {
    expect([
      "None",
      "Closed_Fist",
      "Open_Palm",
      "Pointing_Up",
      "Thumb_Down",
      "Thumb_Up",
      "Victory",
      "ILoveYou",
    ]).toContain(gesture.label);
    expect(gesture.score).toBeGreaterThanOrEqual(0);
    expect(gesture.score).toBeLessThanOrEqual(1);
    expect(inside(gesture.box)).toBe(true);
  }
  expect(frame.detections.map((d) => d.label)).toContain("Open_Palm");
  expect(errors).toEqual([]);
});

test("fusion: three task kinds report with their own latency, one frame in flight per worker, workers released", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Count frames handed to each vision worker against results received.
    const stats = { created: 0, sent: 0, received: 0, maxInFlight: 0 };
    Object.assign(window, { spectraWorkerStats: stats });
    const Native = window.Worker;
    window.Worker = class extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        stats.created++;
        let inFlight = 0;
        const post = this.postMessage.bind(this) as (
          message: unknown,
          transfer?: Transferable[],
        ) => void;
        this.postMessage = (message: unknown, transfer?: unknown) => {
          if ((message as { type?: string })?.type === "frame") {
            stats.sent++;
            stats.maxInFlight = Math.max(stats.maxInFlight, ++inFlight);
          }
          post(message, transfer as Transferable[]);
        };
        this.addEventListener("message", (event) => {
          if (event.data?.type === "result" || event.data?.type === "error") {
            stats.received++;
            inFlight--;
          }
        });
      }
    };
  });
  const stats = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            spectraWorkerStats: {
              created: number;
              sent: number;
              received: number;
              maxInFlight: number;
            };
          }
        ).spectraWorkerStats,
    );
  const errors = await open(page, "Fusion");
  // One row per part found, each with its own model's measured latency.
  await expect(row(page, "Body")).toContainText(/33 points · \d+ ms/);
  await expect(row(page, /hand/).first()).toContainText(/21 points · \d+ ms/);
  await expect(row(page, "Face")).toContainText(/478 points · \d+ ms/);
  expect(page.workers()).toHaveLength(3);
  await page.waitForTimeout(3000);
  const running = await stats();
  expect(running.sent).toBeGreaterThan(6);
  expect(running.maxInFlight).toBe(1);
  expect(running.sent - running.received).toBeLessThanOrEqual(3);
  await page.getByRole("button", { name: "Pause detection" }).click();
  const data = await session(page);
  expect(data.mode).toBe("fusion");
  // The export keeps the flat fields, which belong to the primary task: pose.
  expect(data.frames.at(-1)!.landmarks[0]).toHaveLength(33);
  // Ten mode changes later, only the last mode's single worker is alive.
  for (const mode of [
    "Face",
    "Fusion",
    "Segment",
    "Gestures",
    "Fusion",
    "Body",
    "Fusion",
    "Hands",
    "Fusion",
    "Objects",
  ])
    await page.getByRole("button", { name: mode, exact: true }).click();
  await ready(page);
  await expect.poll(() => page.workers().length).toBe(1);
  expect((await stats()).maxInFlight).toBe(1);
  expect(errors).toEqual([]);
});
