/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// Every GPU effect, with a v1 mode whose demo still gives it real input.
const EFFECTS = [
  { label: "Plasma hands", mode: "Hands" },
  { label: "Ember trail", mode: "Hands" },
  { label: "Neon ribbons", mode: "Hands" },
  { label: "Starfield pull", mode: "Hands" },
  { label: "Aura", mode: "Body" },
  { label: "Hologram", mode: "Body" },
  { label: "Echo", mode: "Body" },
  { label: "Face light", mode: "Body" },
];
// Fewest changed pixels that count as "the effect drew". The smallest real
// effect (Face light on the pose model's eyes) changes far more than this.
const MIN_CHANGED = 150;

type GlProbe = {
  steps: number;
  total(): number;
  counts(): Record<string, number>;
};
type Probed = Window & {
  __spectraGl?: GlProbe;
  __contexts: WebGL2RenderingContext[];
  __shots: Record<string, Uint8ClampedArray>;
};

/** Console errors and page errors. MediaPipe writes its own "INFO:" start-up
 * lines to console.error from the worker; those are not errors. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error" && !/^INFO: /.test(message.text()))
      errors.push(message.text());
  });
  return errors;
}

async function open(page: Page) {
  await page.addInitScript(() => {
    // First-run coach marks would sit over the controls.
    localStorage.setItem("spectra.coach.v1", "1");
    // Record every main-thread WebGL context, to count them and to lose one.
    const made: unknown[] = [];
    Object.assign(window, { __contexts: made, __shots: {} });
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof getContext>
    ) {
      const context = getContext.apply(this, args);
      if (context && /webgl/.test(String(args[0])) && !made.includes(context))
        made.push(context);
      return context;
    } as typeof getContext;
  });
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await ready(page);
}
async function ready(page: Page) {
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
}
const LABELS: Record<string, RegExp> = {
  Objects: /Object detection/,
  Body: /Body tracking/,
  Hands: /Hand tracking/,
};
/** Switch mode. `settle` waits for the mode's first model result; the leak
 * test skips that, because effects are built from the source, not a result.
 *
 * Body is entered by way of Objects. Going straight from Hands to Body
 * unmounts the whole app today: the inspector reads landmark 23 of the stale
 * 21-point hand result (src/panels/inspect.tsx, outside this lane). That is
 * reported in the lane report; this spec must not depend on it. */
async function mode(page: Page, name: string, settle = true) {
  const canvas = page.locator("canvas").first();
  if (
    name === "Body" &&
    LABELS.Hands.test((await canvas.getAttribute("aria-label")) ?? "")
  )
    await mode(page, "Objects", true);
  await page.getByRole("button", { name, exact: true }).first().click();
  await expect(canvas).toHaveAttribute("aria-label", LABELS[name]);
  if (settle) await ready(page);
}
const effect = (page: Page, label: string) =>
  page.getByRole("switch", { name: label, exact: true });
async function setEffect(page: Page, label: string, on: boolean) {
  const control = effect(page, label);
  if ((await control.getAttribute("aria-checked")) !== String(on))
    await control.click();
  await expect(control).toHaveAttribute("aria-checked", String(on));
}
const gl = (page: Page) =>
  page.evaluate(() => {
    const probe = (window as unknown as Probed).__spectraGl;
    return probe
      ? { total: probe.total(), steps: probe.steps, counts: probe.counts() }
      : { total: 0, steps: 0, counts: {} };
  });

/** Keep the stage canvas pixels under a name, inside the page. */
const shoot = (page: Page, name: string) =>
  page.evaluate((key) => {
    const canvas = document.querySelector("canvas")!,
      context = canvas.getContext("2d")!;
    (window as unknown as Probed).__shots[key] = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height,
    ).data;
  }, name);
/** Number of pixels that differ visibly between two kept shots. */
const changed = (page: Page, a: string, b: string) =>
  page.evaluate(
    ([first, second]) => {
      const shots = (window as unknown as Probed).__shots,
        x = shots[first],
        y = shots[second];
      if (!x || !y || x.length !== y.length) return -1;
      let count = 0;
      for (let i = 0; i < x.length; i += 4)
        if (
          Math.abs(x[i] - y[i]) > 12 ||
          Math.abs(x[i + 1] - y[i + 1]) > 12 ||
          Math.abs(x[i + 2] - y[i + 2]) > 12
        )
          count++;
      return count;
    },
    [a, b],
  );

/** Switch an effect on over live inference, freeze the stage, and compare the
 * frozen frame with and without it. Pausing stops inference and time, so the
 * two frames share one model result and differ only by the effect. */
async function effectDraws(page: Page, label: string) {
  await setEffect(page, label, true);
  await page.waitForTimeout(1400);
  await page.getByRole("button", { name: "Pause detection" }).click();
  await page.waitForTimeout(250);
  await shoot(page, "on");
  await setEffect(page, label, false);
  await page.waitForTimeout(250);
  await shoot(page, "off");
  await page.waitForTimeout(250);
  await shoot(page, "off-again");
  const noise = await changed(page, "off", "off-again"),
    drawn = await changed(page, "on", "off");
  await page.getByRole("button", { name: "Resume detection" }).click();
  await ready(page);
  return { noise, drawn };
}

test("every GPU effect changes the stage on a demo input without a console error", async ({
  page,
}) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);
  await open(page);
  let current = "";
  const report: string[] = [];
  for (const { label, mode: wanted } of EFFECTS) {
    if (wanted !== current) await mode(page, (current = wanted));
    const { noise, drawn } = await effectDraws(page, label);
    report.push(`${label}: ${drawn} px`);
    // A frozen stage with the effect off must not change at all, or the
    // comparison below would prove nothing.
    expect(noise, `${label}: frozen stage is stable`).toBe(0);
    expect(drawn, `${label}: pixels changed`).toBeGreaterThan(MIN_CHANGED);
  }
  console.log(`effects drew: ${report.join(", ")}`);
  await expect(page.getByText(/stopped: this effect hit an error/)).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("GL objects are released across 20 effect and mode switches, on one context", async ({
  page,
}) => {
  test.setTimeout(600_000);
  const errors = watchErrors(page);
  await open(page);
  const hands = ["Plasma hands", "Ember trail", "Starfield pull"],
    body = ["Aura", "Hologram", "Echo"],
    live: number[] = [],
    idle: number[] = [];
  for (let round = 0; round < 20; round++) {
    const even = round % 2 === 0,
      labels = even ? hands : body;
    await mode(page, even ? "Hands" : "Body", false);
    // Leaving the previous mode disposed its effects: nothing may be left.
    await expect.poll(async () => (await gl(page)).total).toBe(0);
    for (const label of labels) await setEffect(page, label, true);
    await expect.poll(async () => (await gl(page)).total).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    live.push((await gl(page)).total);
    // Off keeps state by contract; a second on must not build it again.
    for (const label of labels) await setEffect(page, label, false);
    for (const label of labels) await setEffect(page, label, true);
    await page.waitForTimeout(200);
    expect((await gl(page)).total).toBe(live[round]);
    for (const label of labels) await setEffect(page, label, false);
    idle.push((await gl(page)).total);
  }
  console.log(`live GL objects per round: ${live.join(" ")}`);
  // The same set of effects always costs the same number of objects.
  for (let round = 2; round < 20; round++)
    expect(live[round], `round ${round}`).toBe(live[round - 2]);
  expect(idle.slice(2)).toEqual(idle.slice(0, -2));
  await mode(page, "Hands");
  await expect.poll(async () => (await gl(page)).total).toBe(0);
  const contexts = await page.evaluate(
    () => (window as unknown as Probed).__contexts.length,
  );
  expect(contexts).toBe(1);
  expect(errors).toEqual([]);
});

test("simulations hold while paused or off, and a lost context comes back", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await open(page);
  await mode(page, "Hands");
  await setEffect(page, "Ember trail", true);
  const steps = async () => (await gl(page)).steps;
  await expect.poll(steps).toBeGreaterThan(10);

  await page.getByRole("button", { name: "Pause detection" }).click();
  await page.waitForTimeout(200);
  const paused = await steps();
  await page.waitForTimeout(900);
  expect(await steps()).toBe(paused);
  await page.getByRole("button", { name: "Resume detection" }).click();
  await expect.poll(steps).toBeGreaterThan(paused + 5);

  await setEffect(page, "Ember trail", false);
  await page.waitForTimeout(200);
  const off = await steps();
  await page.waitForTimeout(900);
  expect(await steps()).toBe(off);

  expect(errors).toEqual([]);
});

test("a lost WebGL context comes back and the effect draws again", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await open(page);
  await mode(page, "Hands");
  // Lose the context the way a GPU reset would, then let it come back.
  await setEffect(page, "Plasma hands", true);
  await expect.poll(async () => (await gl(page)).total).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const before = (await gl(page)).total;
  await page.evaluate(() => {
    const context = (window as unknown as Probed).__contexts[0];
    Object.assign(window, {
      __lose: context.getExtension("WEBGL_lose_context"),
    });
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext();
  });
  await expect.poll(async () => (await gl(page)).total).toBe(0);
  await page.waitForTimeout(400);
  await page.evaluate(() =>
    (
      window as unknown as { __lose: WEBGL_lose_context }
    ).__lose.restoreContext(),
  );
  // The effect is built again with exactly what it had, and draws again.
  await expect.poll(async () => (await gl(page)).total).toBe(before);
  await setEffect(page, "Plasma hands", false);
  const { noise, drawn } = await effectDraws(page, "Plasma hands");
  expect(noise).toBe(0);
  expect(drawn).toBeGreaterThan(MIN_CHANGED);
  await expect(page.getByText(/stopped: this effect hit an error/)).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("the mask and the face mesh drive Hologram, Aura and Face light where those models run", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await open(page);
  const cases = [
    { button: "Segment", canvas: /segment/i, labels: ["Hologram", "Aura"] },
    { button: "Face", canvas: /face/i, labels: ["Face light"] },
  ];
  for (const { button, canvas, labels } of cases) {
    const control = page.getByRole("button", { name: button, exact: true });
    // These modes belong to the models lane; without them there is no mask
    // or face mesh to test against.
    test.skip(!(await control.count()), `${button} mode is not registered`);
    await control.first().click();
    await expect(page.locator("canvas").first()).toHaveAttribute(
      "aria-label",
      canvas,
    );
    await ready(page);
    for (const label of labels) {
      const { noise, drawn } = await effectDraws(page, label);
      expect(noise, `${label}: frozen stage is stable`).toBe(0);
      expect(drawn, `${label} in ${button}`).toBeGreaterThan(MIN_CHANGED);
    }
  }
  expect(errors).toEqual([]);
});
