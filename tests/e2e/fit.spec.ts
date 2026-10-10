/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  alcove,
  alcoveCentre,
  H,
  IMAGE,
  SHEET,
  sheetCorners,
  shoot,
  type P,
} from "../fixtures/fit-scene";
import { drawRoom } from "../fixtures/ruler-room-scene";

const WIDTH = 2100,
  CENTRE = alcoveCentre(WIDTH);

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
/** The floor photo: the board, the alcove's outline and a 50 mm grid, drawn
 * through the fixture's camera. */
async function loadScene(page: Page) {
  const png = await page.evaluate(drawRoom, {
    w: IMAGE.w,
    h: IMAGE.h,
    H,
    k: 0,
    sheet: SHEET,
    room: alcove(WIDTH),
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "fit-scene.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}
async function tap(page: Page, p: P) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / IMAGE.w, box.height / IMAGE.h);
  await page.mouse.click(
    box.x + (box.width - IMAGE.w * scale) / 2 + p.x * scale,
    box.y + (box.height - IMAGE.h * scale) / 2 + p.y * scale,
  );
}
const group = (page: Page, name: string) =>
  page.getByRole("group", { name, exact: true });
const shape = (page: Page, name: string) =>
  group(page, "Shape").getByRole("button", { name, exact: true });

/** For each picture point: is a pixel of the box's colour drawn within a few
 * pixels of it on the stage canvas? Also the count of such pixels overall.
 * The box is violet until it has a verdict, then takes the verdict's colour:
 * mint when it fits (the Area outline's colour too, so that count includes
 * the outline) and pink when it does not. The photo is grey. */
type Ink = "violet" | "fits" | "over";
function boxInk(page: Page, at: P[], ink: Ink = "violet") {
  return page.locator(".camera-stage canvas").evaluate(
    (c: HTMLCanvasElement, arg) => {
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
        ratio = c.width / c.clientWidth,
        scale = Math.min(c.clientWidth / arg.w, c.clientHeight / arg.h),
        violet = (x: number, y: number) => {
          if (x < 0 || y < 0 || x >= c.width || y >= c.height) return false;
          const i = (y * c.width + x) * 4,
            r = d[i],
            g = d[i + 1],
            b = d[i + 2];
          return arg.ink === "fits"
            ? g - r > 40 && g - b > 15
            : arg.ink === "over"
              ? r - g > 40 && r - b > 25 && b - g > 5
              : b - g > 40 && r - g > 15;
        };
      let total = 0;
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) if (violet(x, y)) total++;
      const near = arg.at.map((p) => {
        const x = Math.round(
            ((c.clientWidth - arg.w * scale) / 2 + p.x * scale) * ratio,
          ),
          y = Math.round(
            ((c.clientHeight - arg.h * scale) / 2 + p.y * scale) * ratio,
          ),
          r = Math.ceil(4 * ratio);
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++)
            if (violet(x + dx, y + dy)) return true;
        return false;
      });
      return { total, near };
    },
    { at, w: IMAGE.w, h: IMAGE.h, ink },
  );
}
/** The true picture places of the top corners of a box at the alcove's centre. */
const topCorners = (w: number, d: number, h: number): P[] =>
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([i, j]) => shoot(CENTRE.x + (i * w) / 2, CENTRE.y + (j * d) / 2, h));

test("stand a box in an outlined alcove: verdict with its bar, drawn in true perspective, Undo and Clear", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await loadScene(page);
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await group(page, "Units")
    .getByRole("button", { name: "cm", exact: true })
    .click();
  await page.getByRole("button", { name: "Custom", exact: true }).click();
  await page.getByLabel("Side 1 (mm)").fill("1000");
  await page.getByLabel("Side 2 (mm)").fill("700");
  // The Box tool waits for the reference.
  await expect(shape(page, "Box")).toBeDisabled();
  const [c0, c1, c2, c3] = sheetCorners();
  for (const c of [c1, c3, c0, c2]) await tap(page, c);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");

  // Outline the alcove.
  await shape(page, "Area").click();
  for (const p of alcove(WIDTH)) await tap(page, shoot(p.x, p.y));
  await shape(page, "Close outline").click();
  await expect(page.getByTestId("ruler-area")).toHaveCount(1);

  // Choose Box: a 180 x 70 x 85 cm box, not yet on the picture.
  await shape(page, "Box").click();
  await expect(page.getByTestId("ruler-step")).toContainText(
    "Tap the floor to stand the box there",
  );
  const size = group(page, "Box size");
  await size.getByLabel("Width (cm)").fill("180");
  await size.getByLabel("Depth (cm)").fill("70");
  await size.getByLabel("Height (cm)").fill("85");
  await expect(page.getByTestId("fit-hint")).toContainText("No box");
  await expect(page.getByTestId("fit-verdict")).toHaveCount(0);
  await expect(page.getByTestId("fit-no-height")).toHaveCount(0);
  const small = topCorners(1800, 700, 850),
    big = topCorners(2400, 700, 850);
  expect((await boxInk(page, small)).total).toBe(0);
  // Mint already on the picture: the Area outline and its label.
  const outline = await boxInk(page, small, "fits");
  expect(outline.near).toEqual([false, false, false, false]);

  // Stand it in the middle of the alcove. Truth: 150 mm of room all round.
  await tap(page, shoot(CENTRE.x, CENTRE.y));
  const verdict = page.getByTestId("fit-verdict");
  await expect(verdict).toHaveText(/^Fits, with \d+ ± \d+ cm of clearance$/);
  // The verdict leads the section: it is on screen, whole, the moment the
  // box is placed, with no scrolling. Its mark is a tick, not only a colour.
  await expect(verdict).toBeInViewport({ ratio: 1 });
  const mark = page.getByTestId("fit-row").locator(".fit-mark");
  await expect(mark).toHaveText("✓");
  await expect(mark).toBeInViewport({ ratio: 1 });
  const mm = Number(await verdict.getAttribute("data-mm")),
    bar = Number(await verdict.getAttribute("data-error-mm"));
  expect(await verdict.getAttribute("data-kind")).toBe("fits");
  expect(bar).toBeGreaterThan(0);
  expect(Math.abs(mm - 150)).toBeLessThanOrEqual(bar);
  // The bar is wide here, so being inside it says little: the value itself
  // is within 1% of the true 150 mm.
  expect(Math.abs(mm - 150) / 150).toBeLessThan(0.01);
  await expect(page.getByTestId("fit-basis")).toContainText(
    "2 standard deviations",
  );
  await expect(page.getByTestId("fit-basis")).toContainText("Not included");
  // One reference: the Ruler's own sentence is quoted, and the measured
  // share for that case is given.
  await expect(page.getByTestId("fit-basis")).toContainText(
    "whose own basis is: Tap placement only.",
  );
  await expect(page.getByTestId("fit-basis")).toContainText("91 times in 100");
  // The canvas changed where the box is: its top face is drawn at the true
  // camera's places for its four top corners, and not out where a wider
  // box's corners would be.
  // It is drawn in the colour of its verdict, mint for "fits", not violet.
  await expect
    .poll(async () => (await boxInk(page, small, "fits")).near)
    .toEqual([true, true, true, true]);
  const drawn = await boxInk(page, big, "fits");
  expect(drawn.total - outline.total).toBeGreaterThan(500);
  expect(drawn.near).toEqual([false, false, false, false]);
  expect((await boxInk(page, small)).total).toBe(0);
  expect((await boxInk(page, small, "over")).total).toBe(0);

  // Make it 240 cm wide. Truth: 150 mm over at each side wall.
  await size.getByLabel("Width (cm)").fill("240");
  await expect(verdict).toHaveText(/^Does not fit: over by \d+ ± \d+ cm$/);
  await expect(mark).toHaveText("×");
  // Typing in a field further down did not push the verdict out of view.
  await expect(verdict).toBeInViewport({ ratio: 1 });
  const over = Number(await verdict.getAttribute("data-mm")),
    overBar = Number(await verdict.getAttribute("data-error-mm"));
  expect(await verdict.getAttribute("data-kind")).toBe("over");
  expect(Math.abs(over + 150)).toBeLessThanOrEqual(overBar);
  expect(Math.abs(over + 150) / 150).toBeLessThan(0.01);
  // The wider box is drawn in the colour of "does not fit", pink.
  await expect
    .poll(async () => (await boxInk(page, big, "over")).near)
    .toEqual([true, true, true, true]);
  expect((await boxInk(page, big, "fits")).near).toEqual([
    false,
    false,
    false,
    false,
  ]);
  test.info().annotations.push({
    type: "measured",
    description: `180 cm box: clearance ${mm.toFixed(1)} +- ${bar.toFixed(1)} mm (truth 150); 240 cm box: ${over.toFixed(1)} +- ${overBar.toFixed(1)} mm (truth -150)`,
  });

  // A keyboard turn changes the verdict's number; turning back restores it.
  await group(page, "Turn the box")
    .getByRole("button", { name: "Turn +15°" })
    .press("Enter");
  await expect(verdict).not.toHaveAttribute("data-mm", String(over));
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(verdict).toHaveAttribute("data-mm", String(over));

  // Undo steps back: the width, then the placement.
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(size.getByLabel("Width (cm)")).toHaveValue("180");
  await expect(verdict).toHaveAttribute("data-kind", "fits");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(verdict).toHaveCount(0);
  await expect(page.getByTestId("fit-hint")).toContainText("No box");
  // The box is gone in every colour it can take: only the outline's mint is
  // left, as much as before the box was placed.
  await expect
    .poll(async () => (await boxInk(page, small, "fits")).total)
    .toBe(outline.total);
  expect((await boxInk(page, small)).total).toBe(0);
  expect((await boxInk(page, small, "over")).total).toBe(0);
  // The outline is the Ruler's and is untouched by the Box tool's Undo.
  await expect(page.getByTestId("ruler-area")).toHaveCount(1);

  // Place it again, then Clear: the box goes with everything else.
  await tap(page, shoot(CENTRE.x, CENTRE.y));
  await expect(verdict).toHaveAttribute("data-kind", "fits");
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(verdict).toHaveCount(0);
  await expect(page.getByTestId("ruler-shape")).toHaveCount(0);
  for (const ink of ["violet", "fits", "over"] as const)
    await expect
      .poll(async () => (await boxInk(page, small, ink)).total)
      .toBe(0);
  expect(errors).toEqual([]);
});
