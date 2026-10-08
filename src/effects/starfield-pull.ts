/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { LAVENDER } from "../gl/color";
import { POINT_FRAGMENT } from "../gl/glsl";
import { clamp, hash } from "../gl/maths";
import { createParticles } from "../gl/particles";
import type { Frame } from "../vision/frame";
import type { Point } from "../vision/types";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { handsOf, posesOf, px, py, span, visible } from "./lib/inputs";
import { STAR_UPDATE, STAR_VERTEX } from "./lib/starfield-shaders";
import type { EffectDef } from "./types";

const MAX_PULLS = 4,
  TIPS = [4, 8, 12, 16, 20],
  WRISTS = [15, 16];

/** Starfield pull: a field of stars over the image that falls toward the
 * tracked hands and swirls around them. A closed hand pulls harder than an
 * open one (measured from fingertip spread). Body mode uses the wrists and
 * Objects mode the centres of the tracked objects. Without a tracked point
 * there is no field. The simulation runs on the GPU. */
const starfieldPull: EffectDef = {
  id: "starfield-pull",
  label: "Starfield pull",
  modes: ["hands", "gestures", "fusion", "body", "objects"],
  kind: "gl",
  order: 60,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(
      env,
      { id: "starfield-pull", exposure: 1.1, bloom: 1.2 },
      (kit) => {
        const gl = kit.gl,
          count = kit.software ? 6000 : 20000,
          particles = createParticles(gl, {
            name: "starfield",
            count,
            update: STAR_UPDATE,
            vertex: STAR_VERTEX,
            fragment: POINT_FRAGMENT,
            // Spread over the image with staggered ages, so the field is whole
            // from the first frame and still shows when motion is reduced. It
            // is drawn only while something is tracked.
            seed(index, out, offset) {
              const span = 2.4 + 4.1 * hash(index * 0.37 + 3.1);
              out.fill(0, offset, offset + 8);
              out[offset] = hash(index * 0.531 + 1.9) * 1.78;
              out[offset + 1] = hash(index * 0.917 + 7.3);
              out[offset + 4] = span * hash(index * 0.213 + 5.7);
              out[offset + 5] = span;
              out[offset + 6] = hash(index * 0.731 + 0.17);
              out[offset + 7] = Math.floor(hash(index * 1.37) * 4096);
            },
          });
        // xy in stage units, z strength.
        const pulls = new Float32Array(MAX_PULLS * 3);
        let found = 0;
        const pull = (frame: Frame, p: Point, strength: number) => {
          if (found >= MAX_PULLS) return;
          pulls[found * 3] = (px(frame, p) - frame.rect.x) / frame.rect.h;
          pulls[found * 3 + 1] = (py(frame, p) - frame.rect.y) / frame.rect.h;
          pulls[found++ * 3 + 2] = strength;
        };
        return {
          paint(frame, kit, _level, clock) {
            found = 0;
            const hands = handsOf(frame),
              pose = posesOf(frame)[0];
            for (let h = 0; h < hands.length; h++) {
              const hand = hands[h];
              if (!hand || hand.length < 21) continue;
              // Fingertip spread over palm size: about 1.8 open, 0.9 closed.
              const palm = span(frame, hand[0], hand[9]) || 1;
              let spread = 0;
              for (const tip of TIPS)
                spread += span(frame, hand[tip], hand[9]) / 5;
              pull(frame, hand[9], 0.7 + 1.3 * clamp(1.9 - spread / palm));
            }
            if (!found && pose && pose.length >= 33)
              for (const joint of WRISTS)
                if (visible(pose[joint])) pull(frame, pose[joint], 1);
            if (!found)
              for (const track of frame.tracks) {
                if (found >= MAX_PULLS) break;
                pulls[found * 3] =
                  ((frame.mirror
                    ? 1 - track.box.x - track.box.w / 2
                    : track.box.x + track.box.w / 2) *
                    frame.rect.w) /
                  frame.rect.h;
                pulls[found * 3 + 1] = track.box.y + track.box.h / 2;
                pulls[found++ * 3 + 2] = 1;
              }
            if (!found) return null;
            const { rect } = frame;
            if (clock.dt > 0) {
              const update = particles.update;
              gl.useProgram(update.handle);
              gl.uniform1f(update.loc("uDt"), clock.dt);
              gl.uniform1f(update.loc("uAspect"), rect.w / rect.h);
              gl.uniform1i(update.loc("uCount"), found);
              gl.uniform3fv(update.loc("uPull"), pulls);
              particles.step();
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
            gl.uniform1f(render.loc("uSize"), Math.max(4, rect.h * 0.011));
            gl.uniform1f(render.loc("uTime"), clock.time % 97);
            gl.uniform1f(render.loc("uReach"), 0.42);
            gl.uniform1f(render.loc("uAspect"), rect.w / rect.h);
            gl.uniform1i(render.loc("uCount"), found);
            gl.uniform3fv(render.loc("uPull"), pulls);
            particles.draw();
            for (let i = 0; i < found; i++)
              kit.lines.dot(
                rect.x + pulls[i * 3] * rect.h,
                rect.y + pulls[i * 3 + 1] * rect.h,
                rect.h * 0.07 * pulls[i * 3 + 2],
                LAVENDER,
                0.35,
              );
            kit.flush(false, 0.4);
            return kit.scene;
          },
          reset: particles.reset,
          dispose: particles.dispose,
        };
      },
    ),
};
export default starfieldPull;
