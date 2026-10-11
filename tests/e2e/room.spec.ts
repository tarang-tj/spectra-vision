/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  boardCorners,
  cameraFor,
  drawRoomView,
  MARKS,
  type P,
} from "../fixtures/room-scene";

const IMAGE = { w: 1600, h: 1200 },
  cams = [0, 1, 2, 3].map((i) => cameraFor(i, IMAGE.w, IMAGE.h)),
  on = (i: number, p: P) => cams[i].shoot(p.x, p.y),
  SPAN_MM = Math.hypot(MARKS[0].x - MARKS[1].x, MARKS[0].y - MARKS[1].y);

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
const step = (page: Page) => page.getByTestId("ruler-step");
const thumb = (page: Page, n: number) =>
  page.getByRole("button", { name: new RegExp(`^Picture ${n}, `) });

/** Draw camera `i`'s picture of the room in the page and add it to the room. */
async function addPicture(page: Page, i: number, count: number) {
  const corners = boardCorners(),
    png = await page.evaluate(drawRoomView, {
      ...IMAGE,
      floor: cams[i].floorSeen(),
      board: corners.map((c) => on(i, c)),
      marks: MARKS.map((m) => on(i, m)),
      tick: on(i, { x: corners[0].x + 60, y: corners[0].y - 60 }),
      name: `camera ${i + 1}`,
    });
  await page.getByLabel("Add a picture of this room").setInputFiles({
    name: `room-${i + 1}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.getByTestId("room-strip").locator("li")).toHaveCount(count);
  await expect(page.getByTestId("room-status")).toHaveText(
    `${count} picture${count === 1 ? "" : "s"} in this room.`,
  );
  await expect(thumb(page, count)).toHaveAttribute("aria-pressed", "true");
}
async function openRuler(page: Page) {
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await group(page, "Units")
    .getByRole("button", { name: "m", exact: true })
    .click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
}
/** Tap the board's corners in camera `i`'s picture, scrambled as a person
 * would, and wait for the reference to be solved. */
async function tapBoard(page: Page, i: number) {
  const [c0, c1, c2, c3] = boardCorners().map((c) => on(i, c));
  await expect(step(page)).toContainText("Tap corner 1 of 4");
  for (const c of [c2, c0, c3, c1]) await tap(page, c);
  await expect(step(page)).toContainText("Tap two points");
}
async function reading(page: Page) {
  const out = page.getByTestId("ruler-result").locator("output");
  await expect(out).toHaveText(/^[\d.]+ ± [\d.]+ m$/);
  return {
    text: (await out.textContent())!,
    mm: Number(await out.getAttribute("data-mm")),
    bar: Number(await out.getAttribute("data-error-mm")),
  };
}

test("two pictures of one room: each keeps its own reference and span across switches, by mouse and by keyboard", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await openRuler(page);
  await expect(page.getByTestId("room-status")).toHaveText(
    "No pictures in this room yet.",
  );

  await addPicture(page, 0, 1);
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await tapBoard(page, 0);
  for (const m of MARKS) await tap(page, on(0, m));
  const first = await reading(page);
  expect(Math.abs(first.mm - SPAN_MM)).toBeLessThanOrEqual(first.bar);

  // The second picture starts with nothing tapped and the same reference.
  await addPicture(page, 2, 2);
  await expect(page.getByTestId("ruler-result")).toHaveCount(0);
  await expect(page.getByLabel("Side 1 (mm)")).toHaveValue("1000");
  await tapBoard(page, 2);
  for (const m of MARKS) await tap(page, on(2, m));
  const second = await reading(page);
  expect(Math.abs(second.mm - SPAN_MM)).toBeLessThanOrEqual(second.bar);
  // Two cameras, two sets of taps: the two readings are not the same number.
  expect(second.mm).not.toBe(first.mm);
  test.info().annotations.push({
    type: "measured",
    description: `span between the marks, truth ${SPAN_MM.toFixed(0)} mm: picture 1 ${first.mm.toFixed(0)} +- ${first.bar.toFixed(0)} mm, picture 2 ${second.mm.toFixed(0)} +- ${second.bar.toFixed(0)} mm`,
  });

  // Back to the first picture by mouse: its picture, reference and span.
  await thumb(page, 1).click();
  await expect(thumb(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(thumb(page, 2)).toHaveAttribute("aria-pressed", "false");
  await expect(step(page)).toContainText("Tap two points");
  expect(await reading(page)).toEqual(first);
  // To the second by keyboard.
  await thumb(page, 2).focus();
  await page.keyboard.press("Enter");
  await expect(thumb(page, 2)).toHaveAttribute("aria-pressed", "true");
  expect(await reading(page)).toEqual(second);
  // A span added here stays here.
  await tap(page, on(2, { x: 3000, y: 800 }));
  await tap(page, on(2, { x: 3300, y: 1500 }));
  await expect(page.getByTestId("ruler-result")).toHaveCount(2);
  await thumb(page, 1).click();
  await expect(thumb(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ruler-result")).toHaveCount(1);
  expect(await reading(page)).toEqual(first);

  // Removing the picture on the stage shows the other one, with its taps.
  await page.getByRole("button", { name: "Remove picture 1" }).click();
  await expect(page.getByTestId("room-strip").locator("li")).toHaveCount(1);
  await expect(thumb(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ruler-result")).toHaveCount(2);
  expect(errors).toEqual([]);
});
