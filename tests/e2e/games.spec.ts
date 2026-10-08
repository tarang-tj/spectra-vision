/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

// The games are scored from landmarks. These tests drive them two ways:
// with the real model on the demo inputs (the game must visibly react), and
// with synthetic landmarks injected through window.__spectraGames (a score
// must rise and a round must end without a person in front of the camera).

type Pt = { x: number; y: number; visibility?: number };
type GameState = {
  id: string;
  phase: "countdown" | "playing" | "result";
  status: string;
  score: number;
  combo: number;
  bestCombo: number;
  hits: number;
  misses: number;
  secondsLeft: number;
  tracked: number;
  synthetic: boolean;
  muted: boolean;
  cursors: number[];
  orbs: { id: number; x: number; y: number; r: number }[];
  blades: number;
  travel: number;
  match: number | null;
  hold: number;
  target: string;
  targetLandmarks: Pt[];
  lanes: number[];
  drums: number;
  clock: number;
  next: { lane: number; at: number; y: number } | null;
};
type Hook = {
  inject(landmarks: Pt[][] | null, handedness?: string[]): void;
  state(): GameState | null;
  audio(): {
    context: string;
    played: number;
    live: number;
    voices: number;
  } | null;
  counters(): {
    updates: number;
    draws: number;
    created: number;
    disposed: number;
  };
  configure(next: { roundMs?: number; seed?: number }): void;
};
type TestWindow = {
  __spectraGames: Hook;
  __audio: { made: number; closed: number };
  __bot?: number;
};

const state = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__spectraGames.state());
const counters = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as TestWindow).__spectraGames.counters(),
  );
const audio = (page: Page) =>
  page.evaluate(() => (window as unknown as TestWindow).__audio);
const stopBot = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as TestWindow;
    clearInterval(w.__bot);
    w.__spectraGames.inject(null);
  });

/** Open the app with a short round and a counter of AudioContexts. */
async function open(page: Page, roundMs: number) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && /game|audio/i.test(m.text()))
      errors.push(m.text());
  });
  await page.addInitScript(() => {
    const count = { made: 0, closed: 0 };
    Object.assign(window, { __audio: count });
    const Real = window.AudioContext;
    window.AudioContext = class extends Real {
      constructor(options?: AudioContextOptions) {
        super(options);
        count.made++;
      }
      close() {
        count.closed++;
        return super.close();
      }
    };
  });
  // First-run tips float over the stage. If they ever cover a control this
  // test needs, skip them, as a player would.
  await page.addLocatorHandler(
    page.getByRole("group", { name: "Getting started tips" }),
    async () => {
      await page.getByRole("button", { name: "Skip tips" }).click();
    },
  );
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await page.evaluate(
    (ms) =>
      (window as unknown as TestWindow).__spectraGames.configure({
        roundMs: ms,
        seed: 5,
      }),
    roundMs,
  );
  return errors;
}
async function panel(page: Page, name: string) {
  const tab = page
    .getByRole("navigation", { name: "Inspector panel" })
    .getByRole("button", { name, exact: true });
  if (await tab.count()) await tab.click();
}
async function play(page: Page, game: string) {
  await panel(page, "Play");
  await page.getByRole("button", { name: `Play ${game}` }).click();
  await expect.poll(async () => (await state(page))?.phase).toBe("playing");
}

test("Slice: fingertip strokes slice orbs, combo builds, pause freezes it, the round ends and restarts", async ({
  page,
}) => {
  const errors = await open(page, 8000);
  // Loading the app made no sound and no AudioContext: nothing was clicked.
  expect(await audio(page)).toEqual({ made: 0, closed: 0 });
  expect(await state(page)).toBeNull();
  await play(page, "Slice");
  await expect(page.locator(".hud-badge.mode-badge")).toHaveText(
    "Hand tracking",
  );
  // A bot that swipes a synthetic index fingertip through whichever orb is
  // in the picture: one sample on each side of it, 70 ms apart.
  await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    let side = 1;
    w.__bot = window.setInterval(() => {
      const orb = w.__spectraGames.state()?.orbs.find((o) => o.y < 0.95);
      if (!orb) return;
      side = -side;
      const tip = { x: orb.x + side * 0.14, y: orb.y };
      w.__spectraGames.inject([Array.from({ length: 21 }, () => tip)]);
    }, 70);
  });
  await expect.poll(async () => (await state(page))!.hits).toBeGreaterThan(2);
  const mid = (await state(page))!;
  expect(mid.synthetic).toBe(true);
  expect(mid.score).toBeGreaterThanOrEqual(30);
  expect(mid.bestCombo).toBeGreaterThanOrEqual(2);
  // Every hit made a sound, after the click that started the game.
  const sound = await page.evaluate(() =>
    (window as unknown as TestWindow).__spectraGames.audio(),
  );
  expect(sound!.context).toBe("running");
  expect(sound!.played).toBeGreaterThan(mid.hits);
  expect((await audio(page)).made).toBe(1);

  // Paused: the game is drawn but not advanced, however hard the bot swipes.
  await page.getByRole("button", { name: "Pause detection" }).click();
  await page.waitForTimeout(150);
  const before = { ...(await counters(page)), ...(await state(page))! };
  await page.waitForTimeout(900);
  const after = { ...(await counters(page)), ...(await state(page))! };
  expect(after.updates).toBe(before.updates);
  expect(after.draws).toBeGreaterThan(before.draws + 10);
  expect([after.score, after.secondsLeft]).toEqual([
    before.score,
    before.secondsLeft,
  ]);
  await page.getByRole("button", { name: "Resume detection" }).click();

  await expect.poll(async () => (await state(page))!.phase).toBe("result");
  await stopBot(page);
  const end = (await state(page))!;
  expect(end.status).toBe("Round over");
  expect(end.secondsLeft).toBe(0);
  expect(end.score).toBeGreaterThan(mid.score - 1);
  // The score is frozen once the round is over.
  await page.waitForTimeout(400);
  expect((await state(page))!.score).toBe(end.score);

  await page.getByRole("button", { name: "Play again" }).click();
  await expect.poll(async () => (await state(page))!.phase).toBe("countdown");
  expect((await state(page))!.score).toBe(0);
  await page.getByRole("button", { name: "Mute game sound" }).click();
  await expect(
    page.getByRole("button", { name: "Unmute game sound" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await state(page))!.muted).toBe(true);
  await page.getByRole("button", { name: "Unmute game sound" }).click();
  expect((await state(page))!.muted).toBe(false);

  // Stopping releases everything: no game, no controls, no audio context,
  // and nothing still counting frames.
  await page.getByRole("button", { name: "Stop Slice" }).click();
  await expect.poll(() => state(page)).toBeNull();
  await expect(page.locator(".game-controls")).toHaveCount(0);
  const stopped = await counters(page);
  expect(stopped.created).toBe(stopped.disposed);
  await page.waitForTimeout(400);
  expect((await counters(page)).updates).toBe(stopped.updates);
  expect(await audio(page)).toEqual({ made: 1, closed: 1 });
  // Leaving the game's mode stops it too.
  await play(page, "Slice");
  await page.getByRole("button", { name: "Body", exact: true }).click();
  await expect.poll(() => state(page)).toBeNull();
  const left = await counters(page);
  expect(left.created).toBe(left.disposed);
  expect(await audio(page)).toEqual({ made: 2, closed: 2 });
  expect(errors).toEqual([]);
});

test("Mirror: the real pose is measured, a matched pose held still locks in and scores, the round ends", async ({
  page,
}) => {
  const errors = await open(page, 9000);
  await play(page, "Mirror");
  await expect(page.locator(".hud-badge.mode-badge")).toHaveText(
    "Body tracking",
  );
  // The real pose model on the demo studio photo: a body is tracked and its
  // similarity to the target is a real number, not a placeholder.
  await expect.poll(async () => (await state(page))!.tracked).toBe(1);
  const real = (await state(page))!;
  expect(real.synthetic).toBe(false);
  expect(real.match).not.toBeNull();
  expect(real.match!).toBeGreaterThanOrEqual(0);
  expect(real.match!).toBeLessThanOrEqual(1);

  // A bot that strikes the target pose: smaller, off-centre and, on every
  // other pose, as a mirror image. Similarity must not care.
  await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    const swap = [
      [11, 12],
      [13, 14],
      [15, 16],
      [23, 24],
      [25, 26],
      [27, 28],
    ];
    w.__bot = window.setInterval(() => {
      const s = w.__spectraGames.state();
      if (!s || s.phase !== "playing") return;
      const flip = s.hits % 2 === 1;
      const pose = s.targetLandmarks.map((p) => ({
        x: 0.3 + ((flip ? 1 - p.x : p.x) - 0.5) * 0.6,
        y: 0.25 + (p.y - 0.32) * 0.6,
        visibility: 1,
      }));
      if (flip)
        for (const [l, r] of swap) [pose[l], pose[r]] = [pose[r], pose[l]];
      w.__spectraGames.inject([pose]);
    }, 90);
  });
  await expect.poll(async () => (await state(page))!.hits).toBeGreaterThan(2);
  const mid = (await state(page))!;
  // Each lock is worth at least 100 before the combo multiplier.
  expect(mid.score).toBeGreaterThanOrEqual(mid.hits * 100);
  expect(mid.bestCombo).toBe(mid.hits);
  expect(mid.misses).toBe(0);
  // No body at all: nothing locks, and the match reads as unknown.
  await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    clearInterval(w.__bot);
    w.__spectraGames.inject([]);
  });
  await expect.poll(async () => (await state(page))!.match).toBeNull();
  const idle = (await state(page))!;
  await expect.poll(async () => (await state(page))!.phase).toBe("result");
  const end = (await state(page))!;
  expect(end.hits).toBe(idle.hits);
  expect(end.score).toBe(idle.score);
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible();
  await stopBot(page);
  await page.getByRole("button", { name: "Stop Mirror" }).click();
  await expect.poll(() => state(page)).toBeNull();
  expect(await audio(page)).toEqual({ made: 1, closed: 1 });
  expect(errors).toEqual([]);
});

test("Conductor: hand height plays notes of the melody, a flick hits the drum, voices stop with the round", async ({
  page,
}) => {
  const errors = await open(page, 10000);
  await play(page, "Conductor");
  // The real hand model on the demo hands photo puts each hand on a row.
  await expect
    .poll(async () => {
      const s = (await state(page))!;
      return !s.synthetic && s.tracked === 2 && s.lanes.every((l) => l >= 0);
    })
    .toBe(true);
  // A bot with one hand: it waits low, rises to each note as its turn
  // comes, and between notes flicks downward for the drum.
  await page.evaluate(() => {
    const w = window as unknown as TestWindow;
    let y = 0.8;
    w.__bot = window.setInterval(() => {
      const s = w.__spectraGames.state();
      if (!s || s.phase !== "playing") return;
      const wait = s.next ? s.next.at - s.clock : 1e9;
      if (wait < 300) y = s.next!.y;
      else if (wait > 700 && wait < 1000) y = y < 0.5 ? y + 0.28 : 0.2;
      else if (y > 0.5) y = 0.8;
      const hand = Array.from({ length: 21 }, (_, i) => ({
        x: 0.5 + (i === 4 ? 0.05 : 0),
        y: y - (i === 9 ? 0 : 0.1),
      }));
      w.__spectraGames.inject([hand], ["Left"]);
    }, 60);
  });
  await expect
    .poll(async () => {
      const s = (await state(page))!;
      return s.hits > 2 && s.drums > 0;
    })
    .toBe(true);
  const mid = (await state(page))!;
  expect(mid.score).toBeGreaterThanOrEqual(mid.hits * 100 + mid.drums * 25);
  expect(mid.lanes[1]).toBe(-1);
  await expect.poll(async () => (await state(page))!.phase).toBe("result");
  await stopBot(page);
  const sound = await page.evaluate(() =>
    (window as unknown as TestWindow).__spectraGames.audio(),
  );
  expect(sound!.voices).toBe(2);
  await page.getByRole("button", { name: "Stop Conductor" }).click();
  await expect.poll(() => state(page)).toBeNull();
  expect(await audio(page)).toEqual({ made: 1, closed: 1 });
  expect(errors).toEqual([]);
});

test("the real hand model on the still and animated demos moves the game's cursors and blades", async ({
  page,
}) => {
  const errors = await open(page, 50_000);
  await play(page, "Slice");
  await expect.poll(async () => (await state(page))!.tracked).toBe(2);
  // Freeze the stage, then look at the pixels: the game draws an amber dot
  // on each index fingertip the model found.
  await page.getByRole("button", { name: "Pause detection" }).click();
  await page.waitForTimeout(200);
  const seen = await page.evaluate(() => {
    const s = (window as unknown as TestWindow).__spectraGames.state()!,
      canvas = document.querySelector("canvas")!,
      ctx = canvas.getContext("2d")!,
      scale = canvas.width / canvas.clientWidth,
      amber: boolean[] = [];
    for (let i = 0; i < s.cursors.length; i += 2) {
      const [r, g, b] = ctx.getImageData(
        Math.round(s.cursors[i] * scale),
        Math.round(s.cursors[i + 1] * scale),
        1,
        1,
      ).data;
      amber.push(r > 220 && g > 180 && g < 235 && b > 100 && b < 180);
    }
    return { synthetic: s.synthetic, cursors: s.cursors.length / 2, amber };
  });
  expect(seen).toEqual({ synthetic: false, cursors: 2, amber: [true, true] });
  await page.getByRole("button", { name: "Resume detection" }).click();
  // On the animated demo the photo pans, so the real fingertips travel and
  // the blades follow them.
  const still = (await state(page))!.travel;
  await panel(page, "Inspect");
  await page.getByRole("button", { name: "Try motion demo" }).click();
  await expect(page.locator(".hud-badge").first()).toHaveText("ANIMATED DEMO");
  await expect
    .poll(async () => {
      const s = (await state(page))!;
      return !s.synthetic && s.blades > 0 && s.travel > still + 0.02;
    })
    .toBe(true);
  expect(errors).toEqual([]);
});
