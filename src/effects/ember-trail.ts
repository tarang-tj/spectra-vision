/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { MINT } from "../gl/color";
import { POINT_FRAGMENT } from "../gl/glsl";
import { clamp, emitRate, hash, nextAlive, spawnChance } from "../gl/maths";
import { createParticles } from "../gl/particles";
import type { Frame } from "../vision/frame";
import type { Point, VisionResult } from "../vision/types";
import { EMBER_UPDATE, EMBER_VERTEX } from "./lib/ember-shaders";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { handsOf, posesOf, px, py, span, visible } from "./lib/inputs";
import type { EffectDef } from "./types";

// Slots 0..3: wrists and ankles of a body. Slots 4..7: wrist and index
// fingertip of each of two hands.
const POSE_JOINTS = [15, 16, 27, 28],
  HAND_JOINTS = [0, 8],
  SLOTS = 8,
  MEAN_LIFE = 1.75,
  // Particles per second from one joint: at rest, per stage height per second
  // of measured speed, and at most.
  REST = 320,
  GAIN = 3200,
  LIMIT = 2600;

/** Ember trail: particles shed from wrists and ankles (or from the wrist and
 * index fingertip of each hand). They are born on the path the joint was
 * measured to travel, inherit its measured velocity, then rise and cool. A
 * faster joint sheds more. The simulation runs on the GPU. */
const emberTrail: EffectDef = {
  id: "ember-trail",
  label: "Ember trail",
  modes: ["body", "hands", "gestures", "fusion"],
  kind: "gl",
  order: 35,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "ember-trail", exposure: 1.15, bloom: 1.3 }, (kit) => {
      const gl = kit.gl,
        count = kit.software ? 6000 : 20000,
        particles = createParticles(gl, {
          name: "ember",
          count,
          update: EMBER_UPDATE,
          vertex: EMBER_VERTEX,
          fragment: POINT_FRAGMENT,
          // Everything starts dead; only an emitter brings a particle to life.
          seed(index, out, offset) {
            out.fill(0, offset, offset + 8);
            out[offset + 5] = 1;
            out[offset + 6] = hash(index * 0.731 + 0.17);
          },
        });
      // Per slot: position now and at the previous result (stage units), and
      // the velocity measured between the two.
      const at = new Float32Array(SLOTS * 4),
        speed = new Float32Array(SLOTS * 2),
        has = new Uint8Array(SLOTS),
        had = new Uint8Array(SLOTS),
        emit = new Float32Array(SLOTS * 4),
        vel = new Float32Array(SLOTS * 2),
        weight = new Float32Array(SLOTS);
      let seen: VisionResult | null = null,
        stamp = 0,
        alive = 0,
        scale = 0.12;
      const track = (frame: Frame, slot: number, p: Point, gap: number) => {
        const x = (px(frame, p) - frame.rect.x) / frame.rect.h,
          y = (py(frame, p) - frame.rect.y) / frame.rect.h,
          moved = had[slot] === 1;
        at[slot * 4 + 2] = moved ? at[slot * 4] : x;
        at[slot * 4 + 3] = moved ? at[slot * 4 + 1] : y;
        // A tracking jump is not motion: cap what a particle can inherit.
        speed[slot * 2] = moved ? clamp((x - at[slot * 4]) / gap, -4, 4) : 0;
        speed[slot * 2 + 1] = moved
          ? clamp((y - at[slot * 4 + 1]) / gap, -4, 4)
          : 0;
        at[slot * 4] = x;
        at[slot * 4 + 1] = y;
        has[slot] = 1;
      };
      return {
        paint(frame, kit, level, clock) {
          if (frame.result && frame.result !== seen) {
            seen = frame.result;
            const gap = Math.max(clock.live - stamp, 1 / 60);
            stamp = clock.live;
            had.set(has);
            has.fill(0);
            const pose = posesOf(frame)[0],
              hands = handsOf(frame);
            if (pose && pose.length >= 33) {
              scale = span(frame, pose[11], pose[12]) / frame.rect.h;
              POSE_JOINTS.forEach((joint, i) => {
                if (visible(pose[joint])) track(frame, i, pose[joint], gap);
              });
            }
            for (let h = 0; h < Math.min(2, hands.length); h++) {
              const hand = hands[h];
              if (!hand || hand.length < 21) continue;
              if (!pose)
                scale = (span(frame, hand[0], hand[9]) * 1.6) / frame.rect.h;
              HAND_JOINTS.forEach((joint, i) =>
                track(frame, 4 + h * 2 + i, hand[joint], gap),
              );
            }
            scale = clamp(scale, 0.03, 0.6);
          }
          if (!frame.result) has.fill(0);
          let active = 0,
            total = 0;
          for (let slot = 0; slot < SLOTS; slot++) {
            if (!has[slot]) continue;
            for (let k = 0; k < 4; k++) emit[active * 4 + k] = at[slot * 4 + k];
            vel[active * 2] = speed[slot * 2];
            vel[active * 2 + 1] = speed[slot * 2 + 1];
            total += emitRate(
              Math.hypot(speed[slot * 2], speed[slot * 2 + 1]),
              REST,
              GAIN,
              LIMIT,
            );
            weight[active++] = total;
          }
          if (!active && alive < 1) return null;
          for (let i = 0; i < active; i++) weight[i] /= total;
          // The budget follows the intensity and the size of the pool.
          const rate = (total * level * count) / (DEFAULT_INTENSITY * 20000),
            { rect } = frame;
          if (clock.dt > 0) {
            const update = particles.update;
            gl.useProgram(update.handle);
            gl.uniform1f(update.loc("uDt"), clock.dt);
            gl.uniform1f(update.loc("uTime"), clock.time % 97);
            gl.uniform1f(
              update.loc("uSpawn"),
              spawnChance(rate, clock.dt, count, alive),
            );
            gl.uniform1f(update.loc("uScale"), scale);
            gl.uniform1i(update.loc("uCount"), active);
            gl.uniform4fv(update.loc("uEmit"), emit);
            gl.uniform2fv(update.loc("uVel"), vel);
            gl.uniform1fv(update.loc("uWeight"), weight);
            particles.step();
            alive = nextAlive(
              alive,
              active ? rate : 0,
              clock.dt,
              MEAN_LIFE,
              count,
            );
          }
          const render = particles.render;
          gl.useProgram(render.handle);
          gl.uniform4f(
            render.loc("uRect"),
            rect.x,
            rect.y,
            rect.h,
            kit.scene.width / kit.width,
          );
          gl.uniform2f(render.loc("uRes"), kit.width, kit.height);
          gl.uniform1f(
            render.loc("uSize"),
            Math.max(11, scale * rect.h * 0.05),
          );
          gl.uniform1f(render.loc("uTime"), clock.time % 97);
          particles.draw();
          // A glow on each shedding joint: the one thing shown when motion is
          // reduced and no particle moves.
          for (let i = 0; i < active; i++)
            kit.lines.dot(
              rect.x + emit[i * 4] * rect.h,
              rect.y + emit[i * 4 + 1] * rect.h,
              scale * rect.h * 0.14,
              MINT[0],
              MINT[1],
              MINT[2],
              0.55,
            );
          kit.flush(false, 0.5);
          return kit.scene;
        },
        reset() {
          particles.reset();
          has.fill(0);
          had.fill(0);
          alive = 0;
          seen = null;
        },
        dispose: particles.dispose,
      };
    }),
};
export default emberTrail;
