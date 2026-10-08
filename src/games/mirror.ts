/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Mirror: a target pose appears as an outline over your own body; match it
// and hold still to lock it in. Played in Body mode. The rules are in
// lib/pose-logic.ts; the outline is drawn by lib/pose-figure.ts.
import { createGame } from "./lib/game-shell";
import type { Core, Kit } from "./lib/game-shell";
import { drawNote, INK, MINT, ROSE } from "./lib/hud";
import { drawFigure } from "./lib/pose-figure";
import { landmarksFromAngles } from "./lib/pose-layout";
import * as rules from "./lib/pose-logic";
import { nextTarget, TARGETS } from "./lib/pose-targets";
import { difficulty, hit, miss, progress } from "./lib/round";
import type { GameDef } from "./types";

const WRISTS = [15, 16];
const FLASH_MS = 260;

function core({ round, sfx, popups, rng }: Kit): Core {
  const angles = new Float32Array(rules.JOINTS),
    has = new Array<boolean>(rules.JOINTS).fill(false),
    plain = new Float32Array(rules.JOINTS),
    flipped = new Float32Array(rules.JOINTS),
    hold = rules.createHold();
  let index = 0,
    poseClock = 0,
    limit = rules.poseTime(0),
    match: number | null = null,
    // Whether the player is doing the pose as its mirror image.
    mirrored = false,
    flash = FLASH_MS,
    aspect = 1,
    matchSum = 0;
  const next = () => {
    index = nextTarget(rng, index);
    poseClock = 0;
    rules.resetHold(hold);
  };
  return {
    kind: "pose",
    howTo: "Fit your body into the outline and hold still",
    start() {
      index = nextTarget(rng, -1);
      poseClock = matchSum = 0;
      flash = FLASH_MS;
      rules.resetHold(hold);
    },
    step(input, frame, dt) {
      aspect = frame.aspect;
      const target = TARGETS[index];
      rules.poseAngles(input.landmarks[0], aspect, angles, has);
      const a = rules.similarity(angles, has, target.angles, plain),
        b = rules.similarity(angles, has, target.mirrored, flipped);
      // Either way round counts. The outline follows the closer one, with a
      // little stickiness so it does not flip back and forth.
      if (a !== null && b !== null && Math.abs(a - b) > 0.05) mirrored = b > a;
      match = a === null || b === null ? null : Math.max(a, b);
      if (flash < FLASH_MS) flash += dt;
      if (round.phase !== "playing") return;
      poseClock += dt;
      limit = rules.poseTime(difficulty(progress(round)));
      if (rules.holdStep(hold, match, dt)) {
        const points = hit(
          round,
          rules.lockPoints(hold, 1 - poseClock / limit),
        );
        matchSum += hold.sum / Math.max(1, hold.frames);
        popups.pop(`LOCKED +${points}`, frame.width / 2, frame.height / 2, INK);
        sfx.lock();
        flash = 0;
        next();
      } else if (poseClock >= limit) {
        miss(round);
        popups.pop("TOO SLOW", frame.width / 2, frame.height / 2, ROSE);
        sfx.miss();
        next();
      }
    },
    draw(ctx, frame, input) {
      const target = TARGETS[index];
      drawFigure(
        ctx,
        frame,
        input.landmarks[0],
        mirrored ? target.mirrored : target.angles,
        mirrored ? flipped : plain,
        rules.holdProgress(hold),
        flash < FLASH_MS,
      );
      if (round.phase !== "playing") return;
      // Under the score bar, clear of the player's head: the pose to strike
      // and how close the tracked body is to it right now.
      const close = match !== null && match >= rules.LOCK_AT,
        reading = match === null ? "no body" : `${Math.round(match * 100)}%`;
      drawNote(
        ctx,
        frame,
        `${target.name}  ·  ${reading}`,
        126,
        close ? MINT : INK,
      );
      const w = 180,
        x = (frame.width - w) / 2,
        share = Math.max(0, 1 - poseClock / limit);
      // The hold bar fills while the pose matches; a full bar locks it in.
      ctx.fillStyle = "#071016cc";
      ctx.fillRect(x, 146, w, 6);
      ctx.fillStyle = MINT;
      ctx.fillRect(x, 146, w * rules.holdProgress(hold), 6);
      // Time left for this pose drains underneath.
      ctx.fillStyle = share < 0.25 ? ROSE : "#f3f7f6aa";
      ctx.fillRect(x, 154, w * share, 2);
    },
    pointers(input, out) {
      const body = input.landmarks[0];
      let count = 0;
      for (const wrist of WRISTS) {
        const p = body?.[wrist];
        if (!p || (p.visibility ?? 1) < 0.4) continue;
        out[count * 2] = p.x;
        out[count * 2 + 1] = p.y;
        count++;
      }
      return count;
    },
    hint: () =>
      match === null
        ? "Step back so your shoulders and arms are in view"
        : null,
    rows: () => [
      ["Locked", String(round.hits)],
      ["Too slow", String(round.misses)],
      ["Best combo", String(round.bestCombo)],
      [
        "Avg match",
        round.hits ? `${Math.round((matchSum / round.hits) * 100)}%` : "n/a",
      ],
    ],
    snapshot: () => ({
      target: TARGETS[index].name,
      /** Similarity of the tracked body to the target, 0..1, or null. */
      match,
      mirrored,
      hold: rules.holdProgress(hold),
      poseSecondsLeft: Math.max(0, (limit - poseClock) / 1000),
      // The target as pose landmarks, so a test can strike the pose.
      targetLandmarks: landmarksFromAngles(
        TARGETS[index].angles,
        0.5,
        0.32,
        0.16,
        aspect,
      ),
    }),
  };
}

const mirror: GameDef = {
  id: "mirror",
  label: "Mirror",
  requires: "body",
  order: 20,
  create: (env) => createGame("mirror", "Mirror", env, core),
};
export default mirror;
