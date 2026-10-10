/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

// The Depth mode on the real model, on the WebAssembly path (this suite's
// browser has no GPU, like CI). The demo still is a studio: a person standing
// on a floor that runs back to a wall about twice as far away.

type DepthProbe = {
  last(): {
    width: number;
    height: number;
    min: number;
    max: number;
    delegate: string;
    latency: number;
    points: number;
  } | null;
  at(x: number, y: number): number | null;
  cloudHeld(): boolean;
};
type Probed = {
  __spectraDepth?: DepthProbe;
  __spectraGl?: { total(): number };
  __spectraResults?: { count: number };
};
const DEMO = { w: 1586, h: 992 };

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^INFO: /.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}
const mode = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Vision mode" })
    .getByRole("button", { name, exact: true });
const panel = (page: Page, name: string) =>
  page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
const last = (page: Page) =>
  page.evaluate(() => (window as Probed).__spectraDepth?.last() ?? null);
const at = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => (window as Probed).__spectraDepth!.at(px, py)!,
    [x, y],
  );
const glObjects = (page: Page) =>
  page.evaluate(() => (window as Probed).__spectraGl?.total() ?? 0);
const cloudHeld = (page: Page) =>
  page.evaluate(() => (window as Probed).__spectraDepth!.cloudHeld());

async function open(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test deals with whatever is shown. */
    }
  });
  await page.goto("./?spectra-test", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
}
async function openDepth(page: Page) {
  await mode(page, "Depth").click();
  await expect(mode(page, "Depth")).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => last(page), { timeout: 90_000 }).not.toBeNull();
  await expect(page.getByRole("alert")).toHaveCount(0);
}
/** A fingerprint of the stage's pixels, read from the canvas itself. */
const stagePixels = (page: Page) =>
  page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
        ".camera-stage canvas",
      )!,
      data = canvas
        .getContext("2d")!
        .getImageData(0, 0, canvas.width, canvas.height).data;
    let sum = 0;
    for (let i = 0; i < data.length; i += 16) sum = (sum * 31 + data[i]) >>> 0;
    return sum;
  });
/** Screen position of a demo image pixel, through the letterboxed canvas. */
async function screenOf(page: Page, x: number, y: number) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / DEMO.w, box.height / DEMO.h);
  return {
    x: box.x + (box.width - DEMO.w * scale) / 2 + x * scale,
    y: box.y + (box.height - DEMO.h * scale) / 2 + y * scale,
  };
}
async function tap(page: Page, x: number, y: number) {
  const s = await screenOf(page, x, y);
  await page.mouse.click(s.x, s.y);
}

test("Depth loads on demand and maps the demo still: near reads nearer than far, on the delegate it says", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page),
    fetched: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    // The worker, the model and the runtime (not the app's own source files).
    if (/depth-worker|models\/depth|runtime\/ort/.test(url))
      fetched.push(url.replace(/^.*?\/\/[^/]+/, ""));
  });
  await open(page);
  // Nothing of Depth is fetched before the mode is chosen.
  expect(fetched).toEqual([]);
  const started = Date.now();
  await openDepth(page);
  const first = await last(page),
    loadSeconds = (Date.now() - started) / 1000;
  // The demo still at the CPU input size.
  expect(first).toMatchObject({ width: 308, height: 196, delegate: "CPU" });
  expect(first!.latency).toBeGreaterThan(0);
  expect(first!.max - first!.min).toBeGreaterThan(1);
  await expect(page.locator(".hud-badge").nth(1)).toHaveText("Depth map");

  // Would fail on garbage: the floor at the front, the person in the middle
  // and the back wall, in the model's inverse depth (larger is nearer).
  const floor = await at(page, 0.3, 0.95),
    person = await at(page, 0.5, 0.4),
    wall = await at(page, 0.45, 0.12);
  test.info().annotations.push({
    type: "measured",
    description: `first result ${loadSeconds.toFixed(1)} s after choosing Depth; ${first!.latency.toFixed(0)} ms a frame at ${first!.width} x ${first!.height} on ${first!.delegate}; inverse depth floor ${floor.toFixed(2)}, person ${person.toFixed(2)}, wall ${wall.toFixed(2)}`,
  });
  expect(floor).toBeGreaterThan(person * 1.1);
  expect(person).toBeGreaterThan(wall * 1.4);
  expect(floor).toBeGreaterThan(wall * 2);
  // Not a constant map, and not two flat levels either.
  const samples = new Set<string>();
  for (let i = 0; i < 40; i++)
    samples.add((await at(page, (i % 8) / 8 + 0.06, i / 40)).toFixed(1));
  expect(samples.size).toBeGreaterThan(8);

  // Only the WebAssembly runtime was fetched, from the site itself.
  const names = [...new Set(fetched.map((url) => url.split("/").pop()))].sort();
  expect(names).toEqual([
    "depth-worker.js",
    "depth_anything_v2_small.onnx",
    "ort-wasm-simd-threaded.mjs",
    "ort-wasm-simd-threaded.wasm",
    "ort.wasm.min.js",
  ]);
  expect(
    fetched.every((url) =>
      /\/(depth-worker\.js|models\/depth_anything_v2_small\.onnx|runtime\/ort-1\.30\.0\/[^/]+)$/.test(
        url,
      ),
    ),
  ).toBe(true);

  // The inspector lists what really ran, and no length without a fit.
  const rows = page.locator(".detection-row");
  await expect(rows).toHaveCount(6);
  await expect(rows.nth(0)).toContainText(/Nearest\s*\d+\.\d\d \(relative\)/);
  await expect(rows.nth(2)).toContainText("308 x 196 px");
  await expect(rows.nth(3)).toContainText(/\d+ ms/);
  await expect(rows.nth(4)).toContainText("CPU (WebAssembly)");
  await expect(rows.nth(5)).toContainText("relative");
  await expect(page.getByTestId("depth-legend")).toContainText(
    "Bright yellow is near, dark purple is far. The values are relative",
  );
  await expect(page.getByTestId("depth-scale")).toHaveAttribute(
    "data-metric",
    "false",
  );
  await expect(page.locator(".depth-controls")).not.toContainText(/\d m\b/);

  // The map is drawn over the picture: no opacity shows the picture alone.
  const covered = await stagePixels(page);
  await page.getByLabel("Depth map opacity").fill("0");
  await expect.poll(() => stagePixels(page)).not.toBe(covered);

  // The session export carries a summary of each map, not the map.
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export session" }).click();
  const text = await readFile((await (await download).path())!, "utf8"),
    session = JSON.parse(text);
  expect(session.mode).toBe("depth");
  expect(session.frames.length).toBeGreaterThan(0);
  expect(session.frames[0].depth).toEqual({
    width: 308,
    height: 196,
    min: expect.any(Number),
    max: expect.any(Number),
    delegate: "CPU",
    metric: false,
  });
  // A 308 x 196 map would be hundreds of kilobytes.
  expect(JSON.stringify(session.frames[0]).length).toBeLessThan(400);

  // The Lab reports the delegate that ran, and a GPU request on this
  // software renderer is refused with the reason, not silently.
  await panel(page, "Lab").click();
  const line = page.getByTestId("lab-delegate-depth");
  await expect(line).toHaveText("Running on CPU.");
  await expect(page.getByTestId("lab-model-depth")).toContainText(
    "depth_anything_v2_small.onnx",
  );
  await expect(page.getByTestId("lab-model-depth")).toContainText("Apache-2.0");
  await page.getByRole("button", { name: "Run depth on GPU" }).click();
  await expect(line).toHaveText(
    /^(Running on GPU\.|GPU was requested but .+ Running on CPU\.)$/,
  );
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await page.getByRole("button", { name: "Run depth on CPU" }).click();
  await expect(line).toHaveText("Running on CPU.");
  expect(errors).toEqual([]);
});

test("the 3D view draws the points, turns by button, key and drag, and gives its WebGL objects back", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page);
  await openDepth(page);
  const baseline = await glObjects(page),
    flat = await stagePixels(page);
  expect(await cloudHeld(page)).toBe(false);

  await page.getByRole("button", { name: "3D view" }).click();
  // Every cell of the map is a point; the renderer holds a program, a vertex
  // array and two buffers.
  await expect.poll(async () => (await last(page))!.points).toBe(308 * 196);
  expect(await cloudHeld(page)).toBe(true);
  expect((await glObjects(page)) - baseline).toBe(4);
  const front = await stagePixels(page);
  expect(front).not.toBe(flat);

  const turned = page.getByTestId("depth-turn");
  await page.getByRole("button", { name: "Turn left" }).click();
  await expect(turned).toContainText("Turned 10° sideways and 0°");
  await expect.poll(() => stagePixels(page)).not.toBe(front);
  const side = await stagePixels(page);
  // The arrow keys turn it while a turn button has focus.
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await expect(turned).toContainText("Turned 20° sideways and 10°");
  await expect.poll(() => stagePixels(page)).not.toBe(side);
  // A drag on the picture turns it too.
  const from = await screenOf(page, 800, 500);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 4 });
  await page.mouse.up();
  await expect(turned).toContainText(/Turned -1° sideways and 10°/);
  await page.getByRole("button", { name: "Reset view" }).click();
  await expect(turned).toContainText("Turned 0° sideways and 0°");
  // Back where it started, the same picture is drawn again.
  await expect.poll(() => stagePixels(page)).toBe(front);

  // While paused nothing is inferred: no worker loop of its own.
  await page.getByRole("button", { name: "Pause detection" }).click();
  await page.waitForTimeout(500);
  const results = () =>
    page.evaluate(() => (window as Probed).__spectraResults!.count);
  const held = await results();
  await page.waitForTimeout(3500);
  expect(await results()).toBeLessThanOrEqual(held + 1);
  const frozen = await results();
  await page.waitForTimeout(2500);
  expect(await results()).toBe(frozen);
  // It can still be turned while paused.
  await page.getByRole("button", { name: "Turn right" }).click();
  await expect.poll(() => stagePixels(page)).not.toBe(front);
  await page.getByRole("button", { name: "Resume detection" }).click();

  // Leaving the 3D view releases everything it made.
  await page.getByRole("button", { name: "Depth map", exact: true }).click();
  await expect.poll(() => cloudHeld(page)).toBe(false);
  expect(await glObjects(page)).toBe(baseline);

  // So does leaving the mode with the 3D view on, three times over.
  await page.getByRole("button", { name: "3D view" }).click();
  await expect.poll(() => cloudHeld(page)).toBe(true);
  for (let round = 0; round < 3; round++) {
    await mode(page, "Objects").click();
    await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
    await expect.poll(() => cloudHeld(page)).toBe(false);
    expect(await glObjects(page)).toBe(baseline);
    await mode(page, "Depth").click();
    await expect.poll(() => cloudHeld(page), { timeout: 90_000 }).toBe(true);
    expect((await glObjects(page)) - baseline).toBe(4);
  }
  await expect.poll(() => page.workers().length).toBe(1);
  expect(errors).toEqual([]);
});

test("a Ruler reference on the floor puts the map in metres with stated bars, and too little floor is refused", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);
  await open(page);
  await openDepth(page);
  const scale = page.getByTestId("depth-scale"),
    shape = (name: string) =>
      page
        .getByRole("group", { name: "Shape", exact: true })
        .getByRole("button", { name, exact: true });

  // A small rectangle of floor near one depth is not enough to fix both the
  // scale and the shift: Depth stays relative and says what to do.
  await panel(page, "Ruler").click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("300");
  await page.getByLabel("Side 2 (mm)").fill("200");
  for (const [x, y] of [
    [300, 900],
    [420, 900],
    [428, 932],
    [292, 932],
  ])
    await tap(page, x, y);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");
  await panel(page, "Inspect").click();
  await expect(scale).toHaveAttribute("data-metric", "false");
  await expect(scale).toContainText(/Area tool|focal length/);
  await expect(page.locator(".detection-row").nth(5)).toContainText("relative");

  // The same reference with a patch of bare floor outlined from near to far.
  // The rectangle's real size is not known for this generated picture, so the
  // metres here are checked for being stated with bars and for the fit's own
  // agreement with the floor, not against a truth (tests/depth-metric.test.ts
  // does that on a synthetic floor).
  await panel(page, "Ruler").click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1450");
  await page.getByLabel("Side 2 (mm)").fill("1000");
  for (const [x, y] of [
    [912, 722],
    [1200, 722],
    [1450, 865],
    [985, 865],
  ])
    await tap(page, x, y);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");
  await shape("Area").click();
  for (const [x, y] of [
    [80, 980],
    [560, 980],
    [600, 760],
    [420, 740],
  ])
    await tap(page, x, y);
  await shape("Close outline").click();
  await panel(page, "Inspect").click();
  await expect(scale).toHaveAttribute("data-metric", "true");
  await expect(scale).toContainText(
    /fitted to [\d,]+ depth-map cells on the floor marked in the Ruler/,
  );
  // The marked floor's span, each end a value with its bar.
  await expect(scale).toContainText(
    /near to far from the camera: \d+(\.\d+)? ± \d+(\.\d+)? m to \d+(\.\d+)? ± \d+(\.\d+)? m\./,
  );
  await expect(scale).toContainText(/2 standard deviations over \d+ simulated/);
  const text = await scale.innerText(),
    cells = Number(/fitted to ([\d,]+)/.exec(text)![1].replace(/,/g, "")),
    scatter = Number(/fit on that floor: ([\d.]+)%/.exec(text)![1]);
  test.info().annotations.push({
    type: "measured",
    description: text.replace(/\s+/g, " ").slice(0, 400),
  });
  expect(cells).toBeGreaterThan(1500);
  // The model's floor is a plane that agrees with the Ruler's to a few
  // percent of depth; a map unrelated to the scene would not.
  expect(scatter).toBeLessThan(8);
  const nearest = page.locator(".detection-row").nth(0);
  await expect(nearest).toContainText(/Nearest\s*\d+(\.\d+)? ± \d+(\.\d+)? m/);
  await expect(page.locator(".detection-row").nth(5)).toContainText("metric");
  await expect(page.getByTestId("depth-legend")).toContainText(
    /Nearest point: \d+(\.\d+)? ± \d+(\.\d+)? m\./,
  );
  // The 3D view is then built from real positions.
  await page.getByRole("button", { name: "3D view" }).click();
  await expect(page.locator(".depth-controls")).toContainText(
    "Each point sits at its fitted depth along its camera ray",
  );
  await expect
    .poll(async () => (await last(page))!.points)
    .toBeGreaterThan(20_000);
  expect((await last(page))!.points).toBeLessThanOrEqual(308 * 196);

  // Clearing the Ruler takes the metres away again.
  await panel(page, "Ruler").click();
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await panel(page, "Inspect").click();
  await expect(scale).toHaveAttribute("data-metric", "false");
  await expect(page.locator(".detection-row").nth(0)).toContainText(
    "(relative)",
  );
  expect(errors).toEqual([]);
});
