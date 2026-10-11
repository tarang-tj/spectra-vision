/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";
import {
  AREA_MM2,
  boardCentre,
  boardCorners,
  cameraFor,
  CORNERS,
  drawRoomView,
  MARKS,
  WALLS_MM,
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

const shape = (page: Page, name: string) =>
  group(page, "Shape").getByRole("button", { name, exact: true });
const places = (page: Page) => page.getByTestId("room-places").locator("li");
const roomStep = (page: Page) => page.getByTestId("room-step");
async function areaOf(page: Page) {
  const out = page.getByTestId("room-area");
  await expect(out).toHaveText(/^[\d.]+ ± [\d.]+ m²$/);
  return {
    text: (await out.textContent())!,
    mm2: Number(await out.getAttribute("data-mm2")),
    bar: Number(await out.getAttribute("data-error-mm2")),
  };
}

test("a room from two pictures: a refused and an accepted anchor, an outline from corners in both, area against truth", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await openRuler(page);

  // Picture 1 (camera 1 sees floor corners 3 and 4): reference, two corners
  // of the outline, and one mark on the floor beside the board.
  await addPicture(page, 0, 1);
  await tapBoard(page, 0);
  await shape(page, "Room").click();
  await expect(roomStep(page)).toContainText("0 corners in the outline");
  await expect(places(page)).toHaveCount(1);
  await expect(places(page).nth(0)).toContainText("sets the plan's frame");
  await tap(page, on(0, CORNERS[2]));
  await tap(page, on(0, CORNERS[3]));
  await expect(roomStep(page)).toContainText("2 corners in the outline");
  await group(page, "Next tap adds")
    .getByRole("button", { name: "Floor mark", exact: true })
    .click();
  await tap(page, on(0, MARKS[0]));
  await expect(page.getByTestId("room-point")).toHaveCount(3);
  await expect(page.getByTestId("room-point").nth(2)).toContainText(
    "Room point 3: floor mark",
  );
  // A second mark, at the middle of the board: a poor anchor, on purpose.
  await group(page, "Next tap adds")
    .getByRole("button", { name: "Floor mark", exact: true })
    .click();
  await tap(page, on(0, boardCentre()));
  await expect(page.getByTestId("room-point")).toHaveCount(4);

  // Picture 2 (camera 3, the other side of the room). The Room tool stays
  // chosen; the reference's corners come first.
  await addPicture(page, 2, 2);
  await expect(shape(page, "Room")).toHaveAttribute("aria-pressed", "true");
  const [c0, c1, c2, c3] = boardCorners().map((c) => on(2, c));
  for (const c of [c2, c0, c3, c1]) await tap(page, c);
  await expect(places(page).nth(1)).toHaveAttribute("data-state", "unanchored");
  await expect(places(page).nth(1)).toContainText("not on the plan yet");
  // The one wall so far lies wholly in picture 1 and rests on it alone.
  await expect(page.getByTestId("room-wall")).toHaveCount(1);
  await expect(page.getByTestId("room-basis")).toContainText(
    "Rests on 1 picture (picture 1).",
  );

  // A poor anchor first: the mark at the middle of the board cannot say
  // which way round the sheet lies. Refused, in words.
  const markButton = (n: number) =>
    page.getByRole("button", { name: `Mark Room point ${n} in this picture` });
  await markButton(4).click();
  await expect(markButton(4)).toHaveAttribute("aria-pressed", "true");
  await expect(roomStep(page)).toContainText(
    "Tap Room point 4 in this picture",
  );
  await tap(page, on(2, boardCentre()));
  await expect(places(page).nth(1)).toHaveAttribute("data-state", "refused");
  await expect(places(page).nth(1)).toContainText(
    "Room point 4 cannot tell which way round the sheet lies",
  );
  // A wrong anchor: point 3 marked on a different spot. Refused as apart.
  await markButton(3).click();
  await tap(page, on(2, MARKS[1]));
  await expect(places(page).nth(1)).toHaveAttribute("data-state", "refused");
  await expect(places(page).nth(1)).toContainText(
    "The sheet may have moved between pictures, or these are different points.",
  );
  await expect(page.getByTestId("room-basis")).toContainText(
    "Rests on 1 picture (picture 1).",
  );
  // The right spot: placed, half a turn from how its own corners read.
  await page
    .getByRole("button", {
      name: "Take the mark of Room point 3 off this picture",
    })
    .click();
  await markButton(3).click();
  await tap(page, on(2, MARKS[0]));
  await expect(places(page).nth(1)).toHaveAttribute("data-state", "placed");
  await expect(places(page).nth(1)).toContainText(
    "Picture 2 is on the plan, half way round",
  );

  // The other two corners, from this picture, and close.
  await group(page, "Next tap adds")
    .getByRole("button", { name: "Outline corner", exact: true })
    .click();
  await tap(page, on(2, CORNERS[0]));
  await tap(page, on(2, CORNERS[1]));
  await expect(roomStep(page)).toContainText("4 corners in the outline");
  await page
    .getByRole("button", { name: "Close outline", exact: true })
    .click();
  const area = await areaOf(page);
  expect(Math.abs(area.mm2 - AREA_MM2)).toBeLessThanOrEqual(area.bar);
  expect(Math.abs(area.mm2 - AREA_MM2) / AREA_MM2).toBeLessThan(0.05);
  const walls = page.getByTestId("room-wall");
  await expect(walls).toHaveCount(4);
  const truth = [WALLS_MM[2], WALLS_MM[3], WALLS_MM[0], WALLS_MM[1]];
  for (let i = 0; i < 4; i++) {
    const mm = Number(await walls.nth(i).getAttribute("data-mm")),
      bar = Number(await walls.nth(i).getAttribute("data-error-mm"));
    expect(Math.abs(mm - truth[i]), `wall ${i + 1}`).toBeLessThanOrEqual(bar);
  }
  await expect(page.getByTestId("room-basis")).toContainText(
    "Rests on 2 pictures (pictures 1 and 2).",
  );
  test.info().annotations.push({
    type: "measured",
    description: `floor area ${(area.mm2 / 1e6).toFixed(3)} +- ${(area.bar / 1e6).toFixed(3)} m2 (truth ${AREA_MM2 / 1e6}, off ${(((area.mm2 - AREA_MM2) / AREA_MM2) * 100).toFixed(2)}%)`,
  });
  // The numbers rest on the stored pictures: showing picture 1 changes none.
  await thumb(page, 1).click();
  await expect(thumb(page, 1)).toHaveAttribute("aria-pressed", "true");
  expect(await areaOf(page)).toEqual(area);
  expect(errors).toEqual([]);
});
