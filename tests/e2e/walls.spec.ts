/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import {
  boardCorners,
  drawWallsRoom,
  RECT,
  ROOM,
  sceneFor,
  type P,
} from "../fixtures/walls-scene";

const IMAGE = { w: 1200, h: 900 },
  scene = sceneFor(IMAGE.w, IMAGE.h),
  floor = RECT.map((p) => scene.shoot(p.x, p.y)),
  ceiling = RECT.map((p) => scene.shoot(p.x, p.y, ROOM.h)),
  board = boardCorners().map((p) => scene.shoot(p.x, p.y)),
  AREA_MM2 = ROOM.w * ROOM.d;

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
async function saved(page: Page, button: string) {
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: button, exact: true }).click(),
  ]);
  return {
    name: file.suggestedFilename(),
    text: readFileSync((await file.path())!, "utf8"),
  };
}
const preview = (page: Page) =>
  page
    .getByTestId("walls-preview")
    .evaluate((c: HTMLCanvasElement) => c.toDataURL());

test("a known room through the UI: height and area against truth, OBJ exported, preview turned by keyboard", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  const png = await page.evaluate(drawWallsRoom, {
    ...IMAGE,
    floor,
    ceiling,
    board,
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "walls-room.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await group(page, "Units")
    .getByRole("button", { name: "m", exact: true })
    .click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
  // The Walls tool waits for the reference.
  const tool = group(page, "Shape").getByRole("button", {
    name: "Walls",
    exact: true,
  });
  await expect(tool).toBeDisabled();
  for (const c of [board[1], board[3], board[0], board[2]]) await tap(page, c);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");

  await tool.click();
  const step = page.getByTestId("walls-step"),
    close = page.getByRole("button", { name: "Close room", exact: true });
  await expect(step).toContainText("Tap the floor corners");
  await expect(close).toBeDisabled();
  for (const p of floor) await tap(page, p);
  await expect(step).toContainText("4 floor corners placed");
  // Floor numbers come before any height; heights say why they are missing.
  await expect(page.getByTestId("walls-wall")).toHaveCount(3);
  await close.click();
  await expect(page.getByTestId("walls-wall")).toHaveCount(4);
  await expect(page.getByTestId("walls-area")).toHaveText(
    /^[\d.]+ ± [\d.]+ m²$/,
  );
  await expect(page.getByTestId("walls-height")).toContainText(
    "not measured: no ceiling point yet",
  );
  await expect(page.getByTestId("walls-volume")).toContainText("not measured");

  for (let i = 0; i < ceiling.length; i++) {
    await expect(step).toContainText(`above corner ${i + 1} meets the ceiling`);
    await tap(page, ceiling[i]);
  }
  const height = page.getByTestId("walls-height"),
    area = page.getByTestId("walls-area");
  await expect(height).toHaveText(/^[\d.]+ ± [\d.]+ m$/);
  // From this one small board the volume's bar is larger than the volume
  // (about 32 ± 48 m³), so it is said in words. The number is still there.
  const volume = page.getByTestId("walls-volume");
  await expect(volume).toHaveText(
    /^too uncertain to state \(bar ± [\d.]+ m³\)\. Add a larger or second reference, or a known span\.$/,
  );
  expect(Number(await volume.getAttribute("data-error-mm3"))).toBeGreaterThan(
    Number(await volume.getAttribute("data-mm3")),
  );
  // The mean height is stated, so the walls are drawn and nothing refuses.
  await expect(page.getByTestId("walls-no-height")).toHaveCount(0);
  await expect(page.getByTestId("walls-off")).toHaveCount(0);
  const h = Number(await height.getAttribute("data-mm")),
    he = Number(await height.getAttribute("data-error-mm")),
    a = Number(await area.getAttribute("data-mm2")),
    ae = Number(await area.getAttribute("data-error-mm2"));
  test.info().annotations.push({
    type: "measured",
    description: `mean height ${h.toFixed(0)} +- ${he.toFixed(0)} mm (truth ${ROOM.h}); floor area ${(a / 1e6).toFixed(3)} +- ${(ae / 1e6).toFixed(3)} m2 (truth ${AREA_MM2 / 1e6})`,
  });
  expect(he).toBeGreaterThan(0);
  expect(ae).toBeGreaterThan(0);
  expect(Math.abs(h - ROOM.h)).toBeLessThanOrEqual(he);
  expect(Math.abs(a - AREA_MM2)).toBeLessThanOrEqual(ae);
  expect(Math.abs(h - ROOM.h) / ROOM.h).toBeLessThan(0.01);
  expect(Math.abs(a - AREA_MM2) / AREA_MM2).toBeLessThan(0.01);
  // The shell is drawn on the picture in the tool's own colour.
  await expect
    .poll(() =>
      page.locator(".camera-stage canvas").evaluate((c: HTMLCanvasElement) => {
        const d = c
          .getContext("2d")!
          .getImageData(0, 0, c.width, c.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4)
          if (d[i] === 217 && d[i + 1] === 179 && d[i + 2] === 255) n++;
        return n;
      }),
    )
    .toBeGreaterThan(500);
  await expect(page.getByTestId("walls-basis")).toContainText("plumb walls");
  await expect(page.getByTestId("walls-basis")).toContainText(
    "whose own basis is: Tap placement only.",
  );
  await expect(page.getByRole("list", { name: "Walls" })).toContainText(
    "(measured)",
  );

  // The OBJ: eight vertices, six faces, and a bounding box that is the room.
  const obj = await saved(page, "Save OBJ");
  expect(obj.name).toMatch(/\.obj$/);
  const v = obj.text
      .split("\n")
      .filter((l) => l.startsWith("v "))
      .map((l) => l.split(" ").slice(1).map(Number)),
    size = [0, 1, 2].map(
      (k) => Math.max(...v.map((p) => p[k])) - Math.min(...v.map((p) => p[k])),
    );
  expect(v).toHaveLength(8);
  expect(obj.text.split("\n").filter((l) => l.startsWith("f "))).toHaveLength(
    6,
  );
  test.info().annotations.push({
    type: "measured",
    description: `OBJ bounding box ${size.map((s) => s.toFixed(3)).join(" x ")} m`,
  });
  expect(Math.abs(size[0] - 4.2) / 4.2).toBeLessThan(0.01);
  expect(Math.abs(size[1] - 3.1) / 3.1).toBeLessThan(0.01);
  expect(Math.abs(size[2] - 2.44) / 2.44).toBeLessThan(0.01);
  const csv = await saved(page, "Save CSV");
  expect(csv.text).toContain("quantity,value,error (2 sd),unit,status");
  expect(csv.text).toMatch(/^Volume,[\d.]+,[\d.]+,m³,measured$/m);

  // The preview is drawn, and turns from the keyboard.
  const canvas = page.getByTestId("walls-preview"),
    before = await preview(page);
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => preview(page)).not.toBe(before);
  // It holds still when nothing is pressed: no loop is redrawing it.
  const turned = await preview(page);
  await page.waitForTimeout(300);
  expect(await preview(page)).toBe(turned);

  // Undo takes the last ceiling point back; Clear empties the tool.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByRole("list", { name: "Walls" })).toContainText(
    "(assumed: the mean of the measured corners)",
  );
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByTestId("walls-wall")).toHaveCount(0);
  expect(errors).toEqual([]);
});
