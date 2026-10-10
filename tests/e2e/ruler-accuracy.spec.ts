/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { readFileSync } from "node:fs";
import { test, expect, type Download, type Page } from "@playwright/test";
import {
  drawAccuracyRoom,
  KNOWN,
  KNOWN_MM,
  LETTER,
  rectangle,
  SHEET_1,
  SHOT,
  shoot,
  SPANS,
  SPAN_MM,
  type P,
} from "../fixtures/ruler-accuracy-scene";

// A synthetic room with exact truth: a hand-built camera 1.5 m up looking 35
// degrees down a floor, one Letter sheet 1.5 m away, a 1 m span about 5 m
// away and a 3 m line (a wall's foot) whose length a tape would give.
const SHEET = rectangle(SHEET_1, LETTER.long, LETTER.short);

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
async function loadRoom(page: Page) {
  const png = await page.evaluate(drawAccuracyRoom, {
    c: SHOT,
    sheets: [SHEET],
    lines: [KNOWN, SPANS.far],
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "ruler-accuracy.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
}
/** Click an image pixel, through the letterboxed canvas box. */
async function tap(page: Page, p: P) {
  const box = (await page.locator(".camera-stage canvas").boundingBox())!,
    scale = Math.min(box.width / SHOT.w, box.height / SHOT.h);
  await page.mouse.click(
    box.x + (box.width - SHOT.w * scale) / 2 + p.x * scale,
    box.y + (box.height - SHOT.h * scale) / 2 + p.y * scale,
  );
}
const group = (page: Page, name: string) =>
  page.getByRole("group", { name, exact: true });

test("a known span narrows a far span and moves it to the truth; the tape test and the export report it", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await loadRoom(page);
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await group(page, "Units")
    .getByRole("button", { name: "cm", exact: true })
    .click();
  await group(page, "Reference size")
    .getByRole("button", { name: "US Letter", exact: true })
    .click();

  // One sheet, tapped as a person would: scrambled order, and one corner a
  // few pixels off, so the far reading is honestly wrong by a known cause.
  const [c0, c1, c2, c3] = SHEET.map((p) => shoot(SHOT, p));
  for (const c of [c1, c3, { x: c0.x + 3, y: c0.y - 2 }, c2])
    await tap(page, c);
  await expect(page.getByTestId("ruler-step")).toContainText("Tap two points");
  await expect(page.getByTestId("ruler-fused")).toHaveText(
    "The surface is solved from the first reference alone.",
  );

  // The far span with one sheet.
  for (const p of SPANS.far) await tap(page, shoot(SHOT, p));
  const far = page.getByTestId("ruler-result").nth(0).locator("output");
  await expect(far).toHaveText(/^[\d.]+ ± [\d.]+ cm$/);
  const one = {
    mm: Number(await far.getAttribute("data-mm")),
    bar: Number(await far.getAttribute("data-error-mm")),
  };
  expect(one.bar).toBeGreaterThan(0);

  // The 3 m line, measured with a tape: typed, then used as a known span.
  for (const p of KNOWN) await tap(page, shoot(SHOT, p));
  await expect(page.getByTestId("ruler-result")).toHaveCount(2);
  const use = page.getByRole("button", {
    name: "Use measurement 2 as known span",
  });
  await expect(use).toBeDisabled();
  const typed = page.getByLabel("Tape reading for measurement 2, in cm");
  // Text or zero is refused in words, and nothing reads NaN.
  await typed.fill("three metres");
  await expect(page.getByTestId("ruler-tape-check")).toHaveText(
    "Type the tape reading as a number greater than zero.",
  );
  await expect(use).toBeDisabled();
  await typed.fill(String(KNOWN_MM / 10));
  await use.click();
  await expect(use).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("ruler-fused")).toHaveText(
    "One surface solved from 1 reference and 1 known span together.",
  );
  await expect(page.getByTestId("ruler-basis")).toContainText(
    "a tape uncertainty of 2 mm on each typed length",
  );
  await expect
    .poll(async () => Number(await far.getAttribute("data-error-mm")))
    .toBeLessThan(one.bar);
  const fused = {
    mm: Number(await far.getAttribute("data-mm")),
    bar: Number(await far.getAttribute("data-error-mm")),
  };
  test.info().annotations.push({
    type: "measured",
    description: `far 1 m span: one sheet ${one.mm.toFixed(0)} +- ${one.bar.toFixed(0)} mm; with the known 3 m span ${fused.mm.toFixed(0)} +- ${fused.bar.toFixed(0)} mm`,
  });
  expect(fused.bar).toBeLessThan(one.bar / 2);
  expect(Math.abs(fused.mm - SPAN_MM)).toBeLessThan(Math.abs(one.mm - SPAN_MM));
  expect(Math.abs(fused.mm - SPAN_MM)).toBeLessThanOrEqual(fused.bar);

  // Tape test: the far span against what a tape would read (1 m).
  await page
    .getByLabel("Tape reading for measurement 1, in cm")
    .fill(String(SPAN_MM / 10));
  const rows = page.getByTestId("ruler-tape-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("inside the bar");
  await expect(rows.nth(1)).toContainText(
    "used as a known span, so not a check",
  );
  await expect(page.getByTestId("ruler-tape-tally")).toHaveText(
    "1 of 1 tape value inside its bar.",
  );
  // A check is not a correction: the reading did not move.
  expect(Number(await far.getAttribute("data-mm"))).toBe(fused.mm);
  await expect(page.locator(".ruler-panel")).not.toContainText("NaN");

  // The export carries the tape rows and the tally.
  const got: Download[] = [];
  const both = new Promise<void>((resolve) => {
    page.on("download", (d) => {
      got.push(d);
      if (got.length === 2) resolve();
    });
  });
  await page.getByRole("button", { name: "Save plan" }).click();
  await both;
  const csv = readFileSync(
    (await got.find((d) => d.suggestedFilename().endsWith(".csv"))!.path())!,
    "utf8",
  )
    .trim()
    .split("\n");
  expect(csv.find((l) => l.startsWith("span 1,tape,"))).toMatch(
    /^span 1,tape,100,,cm,,.*reading minus tape [+-]?[\d.]+ cm; inside the bar/,
  );
  expect(csv.find((l) => l.startsWith("span 2,tape,"))).toMatch(
    /^span 2,tape,300,,cm,,.*used as a known span, so not a check/,
  );
  expect(csv.find((l) => l.startsWith("tape test,tally,"))).toContain(
    "1 of 1 tape value inside its bar",
  );
  expect(errors).toEqual([]);
});

test("a second sheet is tapped as a further reference and can be removed", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await open(page);
  // The same room with a second Letter sheet two metres further away.
  const second = rectangle({ x: 800, y: 3500 }, LETTER.long, LETTER.short);
  const png = await page.evaluate(drawAccuracyRoom, {
    c: SHOT,
    sheets: [SHEET, second],
    lines: [SPANS.far],
  });
  await page.getByLabel("Upload image or video").setInputFiles({
    name: "ruler-accuracy-two.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".hud-badge").first()).toHaveText("LOCAL IMAGE");
  await page.getByRole("button", { name: "Ruler", exact: true }).click();
  await group(page, "Reference size")
    .getByRole("button", { name: "US Letter", exact: true })
    .click();
  for (const p of SHEET) await tap(page, shoot(SHOT, p));
  for (const p of SPANS.far) await tap(page, shoot(SHOT, p));
  const far = page.getByTestId("ruler-result").nth(0).locator("output"),
    one = Number(await far.getAttribute("data-error-mm"));

  await page
    .getByRole("button", { name: "Add reference", exact: true })
    .click();
  await expect(page.getByTestId("ruler-step")).toContainText(
    "Tap corner 1 of 4 of reference 2 (US Letter)",
  );
  for (const p of second) await tap(page, shoot(SHOT, p));
  await expect(page.getByTestId("ruler-fused")).toHaveText(
    "One surface solved from 2 references together.",
  );
  await expect(
    page.getByRole("list", { name: "Further references" }),
  ).toContainText("Reference 2 (US Letter, 279.4 x 215.9 mm): used.");
  const two = Number(await far.getAttribute("data-error-mm"));
  expect(two).toBeLessThan(one / 3);
  expect(
    Math.abs(Number(await far.getAttribute("data-mm")) - SPAN_MM),
  ).toBeLessThanOrEqual(two);

  // From the keyboard: Remove puts the first reference's own solve back.
  const remove = page.getByRole("button", { name: "Remove reference 2" });
  await remove.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ruler-fused")).toHaveText(
    "The surface is solved from the first reference alone.",
  );
  expect(Number(await far.getAttribute("data-error-mm"))).toBe(one);
});
