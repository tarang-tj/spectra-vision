/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFileSync } from "node:fs";
import { test, expect, type Download, type Page } from "@playwright/test";
import {
  bend,
  bentLine,
  drawRoom,
  H,
  IMAGE,
  K,
  ROOM,
  ROOM_AREA_MM2,
  ROOM_PERIMETER_MM,
  SHEET,
  sheetCorners,
  toImage,
  type P,
} from "../fixtures/ruler-room-scene";

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
async function loadRoom(page: Page, k: number) {
  const png = await page.evaluate(drawRoom, {
    w: IMAGE.w,
    h: IMAGE.h,
    H,
    k,
    sheet: SHEET,
    room: ROOM,
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "ruler-room.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}
/** Screen position of an image pixel, through the letterboxed canvas box. */
async function screenOf(page: Page, p: P) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h);
  return {
    x: box.x + (box.width - IMAGE.w * scale) / 2 + p.x * scale,
    y: box.y + (box.height - IMAGE.h * scale) / 2 + p.y * scale,
  };
}
async function tap(page: Page, p: P) {
  const s = await screenOf(page, p);
  await page.mouse.click(s.x, s.y);
}
const group = (page: Page, name: string) =>
  page.getByRole("group", { name, exact: true });
const shape = (page: Page, name: string) =>
  group(page, "Shape").getByRole("button", { name, exact: true });

async function openRuler(page: Page) {
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await group(page, "Units")
    .getByRole("button", { name: "cm", exact: true })
    .click();
  // The reference is a 1000 x 700 mm board: one sheet of paper is too small
  // to measure a room well.
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
}
async function tapSheet(page: Page, k: number) {
  // Scrambled order, as a person would tap them.
  const [c0, c1, c2, c3] = sheetCorners().map((p) => (k ? bend(p, k) : p));
  for (const c of [c1, c3, c0, c2]) await tap(page, c);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");
}
const roomPoints = (k: number) =>
  ROOM.map(toImage).map((p) => (k ? bend(p, k) : p));

async function bothDownloads(page: Page, click: () => Promise<void>) {
  const got: Download[] = [];
  const done = new Promise<void>((resolve) => {
    page.on("download", (d) => {
      got.push(d);
      if (got.length === 2) resolve();
    });
  });
  await click();
  await done;
  const named = (ext: string) =>
    got.find((d) => d.suggestedFilename().endsWith(ext))!;
  return {
    svg: readFileSync((await named(".svg").path())!, "utf8"),
    csv: readFileSync((await named(".csv").path())!, "utf8"),
  };
}

test("outline a known rectangle through the UI: area and perimeter within 1%, truth in the bars, plan exported", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await loadRoom(page, 0);
  await openRuler(page);
  await tapSheet(page, 0);

  await shape(page, "Area").click();
  await expect(page.getByTestId("ruler-step")).toContainText("Tap each point");
  // The close button waits for three points.
  const close = shape(page, "Close outline");
  await expect(close).toBeDisabled();
  for (const p of roomPoints(0)) await tap(page, p);
  await expect(close).toBeEnabled();
  await expect(page.getByTestId("ruler-step")).toContainText("4 points placed");
  await close.click();

  const area = page.getByTestId("ruler-area"),
    perimeter = page.getByTestId("ruler-length");
  await expect(area).toHaveText(/^[\d.]+ ± [\d.]+ cm²$/);
  const a = Number(await area.getAttribute("data-mm2")),
    ae = Number(await area.getAttribute("data-error-mm2")),
    p = Number(await perimeter.getAttribute("data-mm")),
    pe = Number(await perimeter.getAttribute("data-error-mm"));
  test.info().annotations.push({
    type: "measured",
    description: `area ${(a / 100).toFixed(1)} +- ${(ae / 100).toFixed(1)} cm2 (truth ${ROOM_AREA_MM2 / 100}, off ${(((a - ROOM_AREA_MM2) / ROOM_AREA_MM2) * 100).toFixed(2)}%); perimeter ${p.toFixed(1)} +- ${pe.toFixed(1)} mm (truth ${ROOM_PERIMETER_MM}, off ${(((p - ROOM_PERIMETER_MM) / ROOM_PERIMETER_MM) * 100).toFixed(2)}%)`,
  });
  expect(Math.abs(a - ROOM_AREA_MM2) / ROOM_AREA_MM2).toBeLessThan(0.01);
  expect(Math.abs(a - ROOM_AREA_MM2)).toBeLessThanOrEqual(ae);
  expect(Math.abs(p - ROOM_PERIMETER_MM) / ROOM_PERIMETER_MM).toBeLessThan(
    0.01,
  );
  expect(Math.abs(p - ROOM_PERIMETER_MM)).toBeLessThanOrEqual(pe);
  expect(ae).toBeGreaterThan(0);
  // Square metres beside square centimetres, four legs, the fixed wording.
  await expect(page.getByTestId("ruler-area-alt")).toHaveText(
    /^[\d.]+ ± [\d.]+ m²$/,
  );
  await expect(
    page.getByRole("list", { name: "Area 1 legs" }).locator("li"),
  ).toHaveCount(4);
  await expect(page.getByTestId("ruler-basis")).toHaveText(
    "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.",
  );

  // The top-down view is drawn: floor pixels where the picture is known and
  // the dark background where it is not.
  const plan = page.getByTestId("ruler-plan");
  await expect
    .poll(() =>
      plan.evaluate((c: HTMLCanvasElement) => {
        const d = c
          .getContext("2d")!
          .getImageData(0, 0, c.width, c.height).data;
        let grey = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] > 120 && d[i] < 252 && d[i] === d[i + 1]) grey++;
        return grey / (d.length / 4);
      }),
    )
    .toBeGreaterThan(0.2);

  // Save plan: an SVG and a CSV, parsed.
  const files = await bothDownloads(page, () =>
    page.getByRole("button", { name: "Save plan" }).click(),
  );
  expect(files.svg).toContain("<polygon");
  expect(files.svg).toMatch(/area [\d.]+ ± [\d.]+ cm²/);
  expect(files.svg).not.toContain("<image");
  const rows = files.csv
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/));
  const csvArea = rows.find((r) => r[0] === "Area 1" && r[1] === "area")!;
  expect(csvArea[4]).toBe("cm²");
  expect(
    Math.abs(Number(csvArea[2]) * 100 - ROOM_AREA_MM2) / ROOM_AREA_MM2,
  ).toBeLessThan(0.01);
  expect(Number(csvArea[2])).toBeCloseTo(a / 100, 3);
  expect(csvArea[5].replace(/"/g, "").split("; ")).toHaveLength(4);
  const withPhoto = await bothDownloads(page, async () => {
    await page
      .getByRole("button", { name: "Include photo in the saved plan" })
      .click();
    await page.getByRole("button", { name: "Save plan" }).click();
  });
  expect(withPhoto.svg).toContain('<image href="data:image/png;base64,');

  // A bow-tie says it crosses itself instead of giving an area.
  // (Pulled in toward the middle so no tap lands on an existing vertex, which
  // would grab it instead of placing a new one.)
  const pts = roomPoints(0),
    mid = {
      x: pts.reduce((t, q) => t + q.x, 0) / 4,
      y: pts.reduce((t, q) => t + q.y, 0) / 4,
    },
    [r0, r1, r2, r3] = pts.map((q) => ({
      x: mid.x + (q.x - mid.x) * 0.5,
      y: mid.y + (q.y - mid.y) * 0.5,
    }));
  await shape(page, "Path").click();
  await shape(page, "Area").click();
  for (const q of [r0, r2, r1, r3]) await tap(page, q);
  await shape(page, "Close outline").click();
  await expect(
    page.getByText(/crosses itself, so it has no single area/),
  ).toBeVisible();
  await expect(page.getByTestId("ruler-area")).toHaveCount(1);

  // Undo reopens the closed bow-tie; Clear empties everything.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText(/crosses itself/)).toHaveCount(0);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByTestId("ruler-shape")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a path gives each leg and the total", async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  await loadRoom(page, 0);
  await openRuler(page);
  await tapSheet(page, 0);
  await shape(page, "Path").click();
  for (const q of roomPoints(0).slice(0, 3)) await tap(page, q);
  await shape(page, "Finish path").click();
  const total = page.getByTestId("ruler-length");
  const t = Number(await total.getAttribute("data-mm")),
    te = Number(await total.getAttribute("data-error-mm"));
  expect(Math.abs(t - 2000)).toBeLessThanOrEqual(te);
  expect(Math.abs(t - 2000) / 2000).toBeLessThan(0.01);
  await expect(
    page.getByRole("list", { name: "Path 1 legs" }).locator("li"),
  ).toHaveCount(2);
  await expect(page.getByTestId("ruler-area")).toHaveCount(0);
});

test("lens correction reduces measured straightness error and changes the basis", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page);
  await loadRoom(page, K);
  await openRuler(page);
  // Measure the 1200 mm room side before any correction.
  await tapSheet(page, K);
  const [r0, r1] = roomPoints(K);
  await tap(page, r0);
  await tap(page, r1);
  const span = page.getByTestId("ruler-result").first().locator("output");
  const off = Number(await span.getAttribute("data-mm"));

  // Tap three or more points along two or more straight floor lines.
  await page
    .getByRole("button", { name: "Tap straight edges", exact: true })
    .click();
  const lines: [P, P][] = [
    [
      { x: 60, y: 60 },
      { x: 2400, y: 60 },
    ],
    [
      { x: 60, y: 950 },
      { x: 2400, y: 950 },
    ],
    [
      { x: 60, y: 60 },
      { x: 60, y: 950 },
    ],
  ];
  for (const [a, b] of lines) {
    for (const q of bentLine(a, b, 6)) await tap(page, q);
    await page
      .getByRole("button", { name: "Finish edge", exact: true })
      .click();
  }
  const status = page.getByTestId("ruler-lens");
  await expect(status).toContainText("3 straight edges tapped");
  const text = (await status.textContent())!;
  const [, before, after] = text.match(
    /([\d.]+) px from straight in the photo and ([\d.]+) px after/,
  )!;
  test.info().annotations.push({
    type: "measured",
    description: `straightness ${before} px before, ${after} px after; span off by ${(off - 1200).toFixed(1)} mm without correction`,
  });
  expect(Number(after)).toBeLessThan(Number(before));
  // The wording without it is unchanged until it is turned on.
  await expect(page.getByTestId("ruler-basis")).toHaveText(
    "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.",
  );
  await page
    .getByRole("button", { name: "Use lens correction", exact: true })
    .click();
  await expect(page.getByTestId("ruler-basis")).toContainText(
    "one-parameter lens correction",
  );
  await expect(page.getByTestId("ruler-basis")).toContainText(
    "remaining lens distortion",
  );
  const on = Number(await span.getAttribute("data-mm"));
  expect(Math.abs(on - 1200)).toBeLessThan(Math.abs(off - 1200));
  expect(Math.abs(on - 1200) / 1200).toBeLessThan(0.02);
  test.info().annotations.push({
    type: "measured",
    description: `with correction the span is off by ${(on - 1200).toFixed(1)} mm (${(((on - 1200) / 1200) * 100).toFixed(2)}%)`,
  });
  // Turning it off restores the fixed wording.
  await page
    .getByRole("button", { name: "Use lens correction", exact: true })
    .click();
  await expect(page.getByTestId("ruler-basis")).toHaveText(
    "Tap placement only. Not included: lens distortion, points off the surface, a bent or misprinted reference.",
  );
});
