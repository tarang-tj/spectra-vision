/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// The measurement foundation, on the real models: the Smooth landmarks and
// Precision settings, world landmarks, and the stage hooks a panel builds on.
// The `?spectra-test` flag exposes two read-only probes (src/test-hooks.ts).

type Probe = {
  count: number;
  last: {
    mode: string;
    tasks: Record<
      string,
      {
        model: string | null;
        delegate: string;
        landmarks: number[];
        world: number[] | null;
      }
    >;
  } | null;
};
const probe = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __spectraResults: Probe }).__spectraResults,
  );

async function open(page: Page, mode: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    // First-run coach marks would cover the rail.
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  return errors;
}
/** Wait for `count` more merged results, so a setting is shown to keep the
 * models producing, not just to have been clicked. */
async function moreResults(page: Page, count = 3) {
  const from = (await probe(page)).count;
  await expect
    .poll(async () => (await probe(page)).count)
    .toBeGreaterThan(from + count);
}
const poseTask = async (page: Page) => (await probe(page)).last?.tasks.pose;

test("smoothing and precision change how landmarks are measured and the models keep producing results", async ({
  page,
}) => {
  const errors = await open(page, "Body");
  const smooth = page.getByRole("button", { name: "Smooth landmarks" }),
    fast = page.getByRole("button", { name: "Fast", exact: true }),
    precise = page.getByRole("button", { name: "Precise", exact: true });

  // Defaults: smoothing off, Fast. The Lite pose model produced 33 landmarks
  // and, in the same result, 33 world landmarks in metres.
  await expect(smooth).toHaveAttribute("aria-pressed", "false");
  await expect(fast).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => poseTask(page))
    .toMatchObject({
      model: "pose_landmarker_lite.task",
      delegate: "CPU",
      landmarks: [33],
      world: [33],
    });

  // Smoothing: the models keep producing, the setting is kept for a reload,
  // and the exported session still holds the model's own coordinates.
  await smooth.click();
  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await moreResults(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const canvasInk = await page.evaluate(() => {
    const c = document.querySelector("canvas")!,
      data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < data.length; i += 4 * 97)
      if (data[i] + data[i + 1] + data[i + 2] > 60) lit++;
    return lit;
  });
  expect(canvasInk).toBeGreaterThan(100);

  // Precision: the Full model is fetched, loaded on a fresh worker, and the
  // next results come from it, with world landmarks, on CPU.
  const fetched = page.waitForResponse(/models\/pose_landmarker_full\.task$/);
  await precise.click();
  expect((await fetched).status()).toBe(200);
  await expect(precise).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect
    .poll(() => poseTask(page), { timeout: 90_000 })
    .toMatchObject({
      model: "pose_landmarker_full.task",
      delegate: "CPU",
      landmarks: [33],
      world: [33],
    });
  await moreResults(page);

  // Both settings are remembered on this device.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await expect(smooth).toHaveAttribute("aria-pressed", "true");
  await expect(precise).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => poseTask(page), { timeout: 90_000 })
    .toMatchObject({ model: "pose_landmarker_full.task" });

  // And back: Fast, smoothing off, the Lite model again.
  await fast.click();
  await smooth.click();
  await expect
    .poll(() => poseTask(page), { timeout: 90_000 })
    .toMatchObject({ model: "pose_landmarker_lite.task", world: [33] });
  await moreResults(page);
  expect(errors).toEqual([]);
});

test("a panel can draw on the stage and receive pointer input as image points", async ({
  page,
}) => {
  const errors = await open(page, "Hands");
  type Seen = {
    type: string;
    x: number;
    y: number;
    w: number;
    h: number;
    inside: boolean;
  };
  await page.evaluate(() => {
    const w = window as unknown as {
      __spectraStage: {
        addOverlay(
          d: (ctx: CanvasRenderingContext2D, f: any) => void,
        ): () => void;
        onPointer(h: (e: any) => boolean): () => void;
      };
      __seen: unknown[];
      __rect: unknown;
    };
    w.__seen = [];
    // A 24 px magenta square at the centre of the image, via frame.project.
    w.__spectraStage.addOverlay((ctx, frame) => {
      const c = frame.project({ x: 0.5, y: 0.5 });
      ctx.fillStyle = "#ff00ff";
      ctx.fillRect(c.x - 12, c.y - 12, 24, 24);
      w.__rect = { ...frame.rect };
    });
    w.__spectraStage.onPointer((e) => {
      w.__seen.push({
        type: e.type,
        x: e.point.x,
        y: e.point.y,
        w: e.source.width,
        h: e.source.height,
        inside: e.inside,
      });
      return true;
    });
  });
  // Hand world landmarks come with the hands, one list per hand, same indexing.
  await expect
    .poll(async () => {
      const hand = (await probe(page)).last?.tasks.hand;
      return (
        !!hand &&
        hand.landmarks.length > 0 &&
        JSON.stringify(hand.world) === JSON.stringify(hand.landmarks)
      );
    })
    .toBe(true);
  const canvas = page.locator(".camera-stage canvas");
  await expect(canvas).toHaveAttribute("data-pointer", "on");

  // The overlay is on the canvas itself, so Screenshot and Record capture it.
  const magenta = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas")!,
        x = Math.round(c.width / 2),
        y = Math.round(c.height / 2),
        p = c.getContext("2d")!.getImageData(x, y, 1, 1).data;
      return [p[0], p[1], p[2]];
    });
  await expect.poll(magenta).toEqual([255, 0, 255]);

  // A click 100 CSS px right of the centre lands at 0.5 + 100 / drawn width.
  const box = (await canvas.boundingBox())!,
    cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  await page.mouse.move(cx + 100, cy);
  await page.mouse.down();
  await page.mouse.up();
  const rect = (await page.evaluate(
    () => (window as unknown as { __rect: { w: number; h: number } }).__rect,
  )) as { w: number; h: number };
  const seen = (await page.evaluate(
    () => (window as unknown as { __seen: unknown[] }).__seen,
  )) as Seen[];
  const down = seen.find((e) => e.type === "down")!;
  expect(seen.map((e) => e.type)).toEqual(
    expect.arrayContaining(["move", "down", "up"]),
  );
  expect(down.inside).toBe(true);
  expect(down.x).toBeCloseTo(0.5 + 100 / rect.w, 2);
  expect(down.y).toBeCloseTo(0.5, 2);
  expect(down.w).toBeGreaterThan(100);
  expect(down.h).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});
