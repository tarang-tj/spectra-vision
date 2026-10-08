/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// The part every game shares: the round (3-2-1, clock, result card, Play
// again), the HUD, sound, the mute control and the test hook. A game supplies
// a Core: its own rules and its own drawing.
import { createSfx } from "../../audio/sfx";
import type { Sfx } from "../../audio/sfx";
import { createSynth, isMuted, setMuted } from "../../audio/synth";
import type { Synth } from "../../audio/synth";
import type { Frame } from "../../vision/frame";
import type { TaskKind } from "../../vision/types";
import type { GameEnv, GameInstance } from "../types";
import * as hud from "./hud";
import { counters, createInput, options, readInput, setActive } from "./input";
import type { Input } from "./input";
import { createPopups } from "./popups";
import type { Popups } from "./popups";
import * as rounds from "./round";
import * as screens from "./round-screens";
import type { Rng, Round } from "./round";
import { createStageControls } from "./stage-controls";

export type Kit = {
  round: Round;
  sfx: Sfx;
  synth: Synth;
  popups: Popups;
  /** Random numbers for this round (seeded again on every start). */
  rng: Rng;
};
export type Core = {
  /** Which task's landmarks the game is played with. */
  kind: TaskKind;
  /** One line shown during the countdown. */
  howTo: string;
  /** Begin a fresh round. */
  start(): void;
  /** Called every running frame, in every phase. Scoring calls are ignored
   * by the round outside play, so a core only guards its own motion. */
  step(input: Input, frame: Frame, dt: number): void;
  draw(ctx: CanvasRenderingContext2D, frame: Frame, input: Input): void;
  /** Write the image-space x,y of each point the player steers with (index
   * fingertips, wrists) into `out`. Returns how many. */
  pointers(input: Input, out: Float32Array): number;
  /** What to tell a player the model cannot see, or null. */
  hint(input: Input): string | null;
  /** Label and value pairs for the result card. */
  rows(): readonly (readonly [string, string])[];
  /** Extra state for the test hook. */
  snapshot(): Record<string, unknown>;
  /** The round ended or the game is closing: stop any held sound. */
  quiet?(): void;
};

const STATUS = {
  countdown: "Get ready",
  playing: "Playing",
  result: "Round over",
};
/** Hold a hand over Play again this long to press it. */
const DWELL_MS = 1100;
/** The result card ignores hands for this long, so the score can be read. */
const RESULT_GRACE_MS = 1500;
// Best score per game for this visit. Kept in memory only.
const best = new Map<string, number>();

export function createGame(
  id: string,
  title: string,
  env: GameEnv,
  make: (kit: Kit) => Core,
): GameInstance {
  let rng = rounds.createRng(1),
    dwell = 0,
    resultAge = 0,
    count = 0,
    rows: ReturnType<Core["rows"]> = [];
  const round = rounds.createRound(options.roundMs, options.countdownMs),
    synth = createSynth(),
    sfx = createSfx(synth),
    popups = createPopups(),
    input = createInput(),
    points = new Float32Array(8),
    cursors = new Float32Array(8),
    card = { x: 0, y: 0, w: 0, h: 0 },
    again = { x: 0, y: 0, w: 0, h: 0 },
    mute = { x: 0, y: 46, w: 38, h: 38 },
    // One object for the Play panel, updated in place each frame.
    state = { score: 0, status: STATUS.countdown, combo: 0, secondsLeft: 0 },
    core = make({ round, sfx, synth, popups, rng: () => rng() });
  const start = () => {
    rng = rounds.createRng(options.seed ?? (performance.now() * 1000) | 1);
    rounds.restart(round);
    dwell = resultAge = 0;
    popups.clear();
    core.start();
    sfx.tick();
  };
  const controls = createStageControls(env.canvas, {
    again: () => {
      if (round.phase === "result") start();
    },
    mute: () => setMuted(!isMuted()),
  });
  // Map the steering points to canvas pixels once per frame.
  const locate = (frame: Frame) => {
    count = core.pointers(input, points);
    const { rect, mirror } = frame;
    for (let i = 0; i < count; i++) {
      const x = points[i * 2];
      cursors[i * 2] = rect.x + (mirror ? 1 - x : x) * rect.w;
      cursors[i * 2 + 1] = rect.y + points[i * 2 + 1] * rect.h;
    }
  };
  setActive({
    id,
    audio: synth.stats,
    snapshot: () => ({
      phase: round.phase,
      status: state.status,
      score: round.score,
      combo: round.combo,
      bestCombo: round.bestCombo,
      hits: round.hits,
      misses: round.misses,
      secondsLeft: rounds.secondsLeft(round),
      roundMs: round.roundMs,
      best: best.get(id) ?? 0,
      tracked: input.landmarks.length,
      cursors: Array.from(cursors.subarray(0, count * 2)),
      ...core.snapshot(),
    }),
  });
  counters.created++;
  start();
  return {
    update(frame) {
      counters.updates++;
      readInput(frame, core.kind, input);
      const dt = Math.min(frame.dt, rounds.MAX_STEP_MS),
        event = rounds.advance(round, dt);
      if (event === "tick") sfx.tick();
      else if (event === "go") sfx.go();
      else if (event === "end") {
        core.quiet?.();
        rows = core.rows();
        sfx.end();
        best.set(id, Math.max(best.get(id) ?? 0, round.score));
      }
      core.step(input, frame, dt);
      popups.step(dt);
      if (round.phase !== "result") return;
      // Play again by body: hold any steering point over the button.
      resultAge += dt;
      locate(frame);
      screens.resultLayout(frame, card, again);
      let over = false;
      for (let i = 0; i < count && !over; i++) {
        const x = cursors[i * 2] - again.x,
          y = cursors[i * 2 + 1] - again.y;
        over = x >= 0 && x <= again.w && y >= 0 && y <= again.h;
      }
      dwell =
        over && resultAge > RESULT_GRACE_MS
          ? dwell + dt
          : Math.max(0, dwell - dt * 2);
      if (dwell >= DWELL_MS) start();
    },
    draw(ctx, frame) {
      counters.draws++;
      const result = round.phase === "result";
      ctx.save();
      core.draw(ctx, frame, input);
      popups.draw(ctx, frame.animate);
      // The start screen stands alone: there is no score to show yet, and on
      // a phone-sized stage the two would overlap.
      if (round.phase === "countdown")
        screens.drawCountdown(ctx, frame, round, title, core.howTo);
      else hud.drawScoreBar(ctx, frame, round);
      if (result) {
        screens.resultLayout(frame, card, again);
        screens.drawResult(
          ctx,
          frame,
          round,
          title,
          rows,
          best.get(id) ?? 0,
          card,
          dwell / DWELL_MS,
        );
      }
      // An amber dot on every point the player steers with, straight from
      // the landmarks and above everything else: proof on screen that the
      // game sees the player, and the pointer for Play again.
      locate(frame);
      for (let i = 0; i < count; i++) {
        ctx.beginPath();
        ctx.arc(cursors[i * 2], cursors[i * 2 + 1], 7, 0, Math.PI * 2);
        ctx.fillStyle = hud.AMBER;
        ctx.fill();
      }
      mute.x = frame.width - 12 - mute.w;
      hud.drawMute(ctx, mute, isMuted());
      const note = round.phase === "playing" ? core.hint(input) : null;
      if (note) hud.drawNote(ctx, frame, note, frame.height - 92, hud.AMBER);
      if (input.synthetic)
        hud.drawNote(
          ctx,
          frame,
          "SYNTHETIC TEST INPUT",
          frame.height - 92,
          hud.AMBER,
          12,
        );
      ctx.restore();
      controls.place("mute", true, mute.x, mute.y, mute.w, mute.h);
      controls.place("again", result, again.x, again.y, again.w, again.h);
      controls.muted(isMuted());
    },
    state() {
      state.score = round.score;
      state.status = STATUS[round.phase];
      state.combo = round.combo;
      state.secondsLeft = rounds.secondsLeft(round);
      return state;
    },
    dispose() {
      counters.disposed++;
      core.quiet?.();
      controls.dispose();
      synth.dispose();
      setActive(null);
    },
  };
}
