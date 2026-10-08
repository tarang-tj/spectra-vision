/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Slice: glowing orbs rise and fall; a fast index-fingertip stroke through
// one slices it. Played in Hands mode. The rules are in lib/slice-logic.ts.
import type { Frame } from "../vision/frame";
import * as blades from "./lib/blade-logic";
import { createGame } from "./lib/game-shell";
import type { Core, Kit } from "./lib/game-shell";
import { INK, MINT, ROSE } from "./lib/hud";
import { accuracy, difficulty, hit, miss, progress } from "./lib/round";
import * as rules from "./lib/slice-logic";
import type { Orb } from "./lib/slice-logic";
import type { GameDef } from "./types";

const TINTS = ["#a4ffd9", "#67aaff", "#ae94fa", "#ffd18d"];
const INDEX_TIP = 8;
const POINTS = 10;
const TRAIL = 6;
const BURST_MS = 380;

function core({ round, sfx, popups, rng }: Kit): Core {
  const state = rules.createSlice(),
    tips = blades.createBlades(),
    xs = new Float32Array(blades.MAX_BLADES),
    ys = new Float32Array(blades.MAX_BLADES),
    // The last few positions of each blade, newest last, in play space.
    trails = tips.blades.map(() => new Float32Array(TRAIL * 2)),
    lengths = tips.blades.map(() => 0),
    // Rings left where an orb was cut. A fixed pool, reused in order.
    bursts = Array.from({ length: 8 }, () => ({
      x: 0,
      y: 0,
      r: 0,
      tint: 0,
      age: BURST_MS,
    })),
    seen = { frame: null as Frame | null };
  let stamp = -1,
    travel = 0,
    nextBurst = 0;
  // Play space to canvas pixels. The frame is set at the top of step and draw.
  const px = (x: number) => {
    const f = seen.frame!,
      u = x / f.aspect;
    return f.rect.x + (f.mirror ? 1 - u : u) * f.rect.w;
  };
  const py = (y: number) => seen.frame!.rect.y + y * seen.frame!.rect.h;
  const cut = (orb: Orb) => {
    const points = hit(round, POINTS);
    if (!points) return;
    const burst = bursts[nextBurst];
    nextBurst = (nextBurst + 1) % bursts.length;
    burst.x = orb.x;
    burst.y = orb.y;
    burst.r = orb.r;
    burst.tint = orb.tint;
    burst.age = 0;
    popups.pop(`+${points}`, px(orb.x), py(orb.y), INK);
    sfx.slice();
    sfx.hit(round.combo);
  };
  const lost = (orb: Orb) => {
    miss(round);
    popups.pop("MISS", px(orb.x), py(1) - 84, ROSE);
    sfx.miss();
  };
  return {
    kind: "hand",
    howTo: "Swipe an index finger fast through the orbs",
    start() {
      rules.resetSlice(state);
      for (const blade of tips.blades) blade.live = false;
      lengths.fill(0);
      for (const burst of bursts) burst.age = BURST_MS;
      stamp = -1;
    },
    step(input, frame, dt) {
      seen.frame = frame;
      const playing = round.phase === "playing";
      if (input.time !== stamp) {
        // New landmarks: extend each blade and test its stroke.
        stamp = input.time;
        const count = Math.min(input.landmarks.length, blades.MAX_BLADES);
        for (let i = 0; i < count; i++) {
          const tip = input.landmarks[i][INDEX_TIP];
          xs[i] = (tip?.x ?? 0) * frame.aspect;
          ys[i] = tip?.y ?? 0;
        }
        blades.updateBlades(tips, xs, ys, count, input.time);
        tips.blades.forEach((blade, b) => {
          if (!blade.live) return void (lengths[b] = 0);
          if (!blade.dtMs) lengths[b] = 0;
          const trail = trails[b];
          if (lengths[b] === TRAIL) trail.copyWithin(0, 2);
          else lengths[b]++;
          trail[lengths[b] * 2 - 2] = blade.x;
          trail[lengths[b] * 2 - 1] = blade.y;
          travel += blade.moved;
          if (playing && blades.isSlice(blade.moved, blade.dtMs))
            rules.sliceStroke(state, blade.px, blade.py, blade.x, blade.y, cut);
        });
      }
      for (const burst of bursts) if (burst.age < BURST_MS) burst.age += dt;
      if (playing)
        rules.stepSlice(
          state,
          dt,
          difficulty(progress(round)),
          rng,
          frame.aspect,
          lost,
        );
    },
    draw(ctx, frame) {
      seen.frame = frame;
      const { rect } = frame;
      ctx.save();
      // Orbs enter from below the picture: keep them inside it.
      ctx.beginPath();
      ctx.rect(rect.x, rect.y, rect.w, rect.h);
      ctx.clip();
      for (const orb of state.orbs) {
        if (!orb.alive) continue;
        const x = px(orb.x),
          y = py(orb.y),
          r = orb.r * rect.h;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = TINTS[orb.tint] + "cc";
        ctx.shadowColor = TINTS[orb.tint];
        ctx.shadowBlur = 26;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffffaa";
        ctx.fill();
      }
      for (const burst of bursts) {
        if (burst.age >= BURST_MS) continue;
        const t = burst.age / BURST_MS;
        ctx.beginPath();
        ctx.arc(
          px(burst.x),
          py(burst.y),
          burst.r * rect.h * (1 + 1.6 * t),
          0,
          Math.PI * 2,
        );
        ctx.strokeStyle = TINTS[burst.tint];
        ctx.globalAlpha = 1 - t;
        ctx.lineWidth = 5 * (1 - t) + 1;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // The blade: the fingertip's recent path, bright at the tip.
      ctx.lineCap = "round";
      ctx.shadowColor = MINT;
      ctx.shadowBlur = 12;
      tips.blades.forEach((blade, b) => {
        if (!blade.live) return;
        for (let i = 1; i < lengths[b]; i++) {
          ctx.beginPath();
          ctx.moveTo(px(trails[b][i * 2 - 2]), py(trails[b][i * 2 - 1]));
          ctx.lineTo(px(trails[b][i * 2]), py(trails[b][i * 2 + 1]));
          ctx.strokeStyle = i === lengths[b] - 1 ? "#ffffff" : MINT;
          ctx.globalAlpha = i / lengths[b];
          ctx.lineWidth = 2 + (7 * i) / lengths[b];
          ctx.stroke();
        }
      });
      ctx.restore();
    },
    pointers(input, out) {
      const count = Math.min(input.landmarks.length, blades.MAX_BLADES);
      for (let i = 0; i < count; i++) {
        out[i * 2] = input.landmarks[i][INDEX_TIP]?.x ?? 0;
        out[i * 2 + 1] = input.landmarks[i][INDEX_TIP]?.y ?? 0;
      }
      return count;
    },
    hint: (input) =>
      input.landmarks.length ? null : "Show a hand to the camera to slice",
    rows() {
      const share = accuracy(round);
      return [
        ["Sliced", String(round.hits)],
        ["Missed", String(round.misses)],
        ["Best combo", String(round.bestCombo)],
        ["Accuracy", share === null ? "n/a" : `${Math.round(share * 100)}%`],
      ];
    },
    // Round over: clear the air so nothing hangs frozen behind the card.
    quiet() {
      for (const orb of state.orbs) orb.alive = false;
    },
    snapshot: () => ({
      // Orbs in image coordinates (0..1), so a test can aim at them.
      orbs: state.orbs
        .filter((orb) => orb.alive)
        .map((orb) => ({
          id: orb.id,
          x: orb.x / (seen.frame?.aspect ?? 1),
          y: orb.y,
          r: orb.r,
        })),
      blades: tips.blades.filter((blade) => blade.live).length,
      /** Total fingertip travel seen so far, in image heights. */
      travel,
    }),
  };
}

const slice: GameDef = {
  id: "slice",
  label: "Slice",
  requires: "hands",
  order: 10,
  create: (env) => createGame("slice", "Slice", env, core),
};
export default slice;
