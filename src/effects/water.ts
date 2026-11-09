/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createPass } from "../gl/fullscreen";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { handsOf } from "./lib/inputs";
import { createSourceTexture } from "./lib/source-texture";
import { WATER_FRAGMENT } from "./lib/water-shaders";
import { handSample, palmOf, pickHand } from "./lib/water-hand";
import type { HandSample } from "./lib/water-hand";
import {
  DROP_LIFE,
  MAX_DROPS,
  PUDDLE_S,
  createWater,
  resetWater,
  stepWater,
} from "./lib/water-sim";
import type { EffectDef } from "./types";

/** Water: hold an open palm up and a ball of water gathers on it. It
 * follows the palm, a flick throws it, it splashes into drops where it lands
 * and leaves a puddle that fades. Every position comes from hand landmarks;
 * the picture seen through the water is the camera's own. */
const water: EffectDef = {
  id: "water",
  label: "Water",
  modes: ["hands", "gestures", "fusion"],
  kind: "gl",
  order: 32,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "water", exposure: 1, bloom: 0.04 }, (kit) => {
      const gl = kit.gl,
        owned: { dispose(): void }[] = [],
        dispose = () => {
          for (const item of owned) item.dispose();
          owned.length = 0;
        };
      try {
        const pass = createPass(gl, "water", WATER_FRAGMENT);
        owned.push(pass);
        const loc = (name: string) => pass.loc(name);
        const source = createSourceTexture(gl);
        owned.push(source);
        const sim = createWater(kit.software ? MAX_DROPS / 2 : MAX_DROPS),
          most = sim.limit,
          samples = [handSample(), handSample()],
          found = [false, false],
          drops = new Float32Array(MAX_DROPS * 4);
        // Droplet spread only: a seeded generator, called only while the
        // clock runs, so the splash holds still when paused.
        let seed = 1,
          // The hand, mirror and stage size the palm velocity was measured
          // on. If any changes, the palm "moves" without the user moving.
          picked = -1,
          mirror = false,
          wide = 0,
          tall = 0;
        const random = () => {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          return seed / 2 ** 32;
        };
        return {
          paint(frame, kit, level, clock) {
            const hands = handsOf(frame),
              { rect, width, height } = frame,
              strength = level / DEFAULT_INTENSITY;
            const t = frame.result?.time ?? 0,
              count = Math.min(2, hands.length),
              changed =
                frame.mirror !== mirror || rect.w !== wide || rect.h !== tall;
            for (let h = 0; h < count; h++)
              found[h] = palmOf(hands[h], rect, frame.mirror, samples[h], t);
            const pick = pickHand(
                samples,
                found,
                count,
                sim.phase === "held" ? sim : null,
                changed,
              ),
              hand: HandSample | null = pick < 0 ? null : samples[pick];
            // A new hand, mirror or stage size moves the palm without the
            // user moving: start the palm velocity over.
            if (pick !== picked || changed) sim.ht = -1;
            picked = pick;
            mirror = frame.mirror;
            wide = rect.w;
            tall = rect.h;
            sim.limit = Math.max(2, Math.round(most * Math.min(1, strength)));
            const live = frame.paused ? 0 : Math.min(frame.dt, 100) / 1000;
            stepWater(sim, hand, rect, clock.dt, random, live);
            if (sim.phase === "idle") return null;
            const { x, y, vx, vy, r, puddle } = sim,
              shown = sim.phase === "splash" ? 0 : 1,
              grow = sim.phase === "held" ? sim.grow * (2 - sim.grow) : 1,
              speed = sim.phase === "flying" ? Math.hypot(vx, vy) : 0,
              squash = 1 + Math.min(0.4, speed / (r * 25 + 1)),
              fade = puddle.age < 0 ? 0 : 1 - puddle.age / PUDDLE_S;
            let x0 = shown ? x : Infinity,
              y0 = shown ? y : Infinity,
              x1 = shown ? x : -Infinity,
              y1 = shown ? y : -Infinity;
            for (let i = 0; i < sim.dropCount; i++) {
              const dx = sim.drops[i * 5],
                dy = sim.drops[i * 5 + 1];
              drops[i * 4] = dx;
              drops[i * 4 + 1] = dy;
              // Drops shrink as they age, so a slot swap never resizes one.
              drops[i * 4 + 2] =
                r * (0.15 + (0.12 * sim.drops[i * 5 + 4]) / DROP_LIFE);
              drops[i * 4 + 3] = Math.min(1, sim.drops[i * 5 + 4] / 0.25);
              x0 = Math.min(x0, dx);
              x1 = Math.max(x1, dx);
              y0 = Math.min(y0, dy);
              y1 = Math.max(y1, dy);
            }
            if (fade > 0) {
              x0 = Math.min(x0, puddle.x);
              x1 = Math.max(x1, puddle.x);
              y0 = Math.min(y0, puddle.y);
              y1 = Math.max(y1, puddle.y);
            }
            const pad = 2 * r * squash,
              lit = source.update(frame),
              cap = 1 - Math.exp(-strength),
              uy = speed ? vy / speed : 0;
            gl.disable(gl.BLEND);
            kit.into(kit.aux, true);
            gl.useProgram(pass.handle);
            kit.texture(1, lit ? source.texture : null);
            gl.uniform1i(loc("uSource"), 1);
            gl.uniform1f(loc("uHasSource"), lit ? 1 : 0);
            gl.uniform2f(loc("uSize"), width, height);
            gl.uniform4f(loc("uRect"), rect.x, rect.y, rect.w, rect.h);
            gl.uniform1f(loc("uMirror"), frame.mirror ? 1 : 0);
            gl.uniform4f(loc("uBlob"), x, y, r * grow * shown, squash);
            gl.uniform2f(loc("uDir"), speed ? vx / speed : 1, uy);
            gl.uniform4fv(loc("uDrops"), drops);
            gl.uniform1i(loc("uCount"), sim.dropCount);
            gl.uniform4f(loc("uPuddle"), puddle.x, puddle.y, puddle.w, fade);
            gl.uniform4f(loc("uBox"), x0 - pad, y0 - pad, x1 + pad, y1 + pad);
            gl.uniform1f(loc("uBend"), 0.45 * r * strength);
            gl.uniform1f(loc("uLift"), 0.8 * r);
            gl.uniform1f(loc("uTime"), clock.time % 97);
            gl.uniform1f(loc("uE"), strength);
            gl.uniform1f(loc("uCap"), kit.float ? 0.996 : Math.min(0.996, cap));
            kit.fill();
            return kit.aux;
          },
          reset() {
            resetWater(sim);
          },
          dispose,
        };
      } catch (error) {
        dispose();
        throw error;
      }
    }),
};
export default water;
