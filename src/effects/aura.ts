/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { WHITE } from "../gl/color";
import { createPass } from "../gl/fullscreen";
import { glStats } from "../gl/resources";
import { createPingPong } from "../gl/targets";
import { AURA_SHOW, AURA_STEP } from "./lib/aura-shaders";
import { captureFigures, createFigureSet, drawSilhouette } from "./lib/figures";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { matteOf } from "./lib/inputs";
import { createMatteLayer } from "./lib/matte-layer";
import type { EffectDef } from "./types";

/** Aura: the person's silhouette sheds a flowing field of light. The
 * silhouette is the segmentation mask when a segmenter is running; otherwise
 * it is built from capsules around the tracked bones. The field itself lives
 * in a pair of framebuffers that feed back into each other. */
const aura: EffectDef = {
  id: "aura",
  label: "Aura",
  modes: ["body", "hands", "gestures", "segment", "fusion"],
  kind: "gl",
  order: 45,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "aura", exposure: 1.2, bloom: 1.1 }, (kit) => {
      const gl = kit.gl,
        owned: { dispose(): void }[] = [],
        dispose = () => {
          for (const item of owned) item.dispose();
          owned.length = 0;
        };
      try {
        const step = createPass(gl, "aura step", AURA_STEP);
        owned.push(step);
        const show = createPass(gl, "aura show", AURA_SHOW);
        owned.push(show);
        const mask = createMatteLayer(gl);
        owned.push(mask);
        const field = createPingPong(gl, 2, 2, kit.float);
        owned.push(field);
        const figures = createFigureSet();
        // False until the field has been fed once, so an aura switched on
        // while paused or under reduced motion still shows a still rim.
        let fed = false;
        return {
          paint(frame, kit, _level, clock) {
            const matte = matteOf(frame),
              scene = kit.scene;
            // 1. The silhouette, into the scene target.
            if (matte) mask.draw(kit, frame, matte, 1, 1, 1);
            else {
              captureFigures(frame, figures);
              if (!figures.count) return null;
              gl.blendEquation(gl.MAX);
              drawSilhouette(kit.lines, frame, figures, WHITE, 1);
              kit.flush(true);
              gl.blendEquation(gl.FUNC_ADD);
            }
            gl.disable(gl.BLEND);
            if (
              field.resize(
                Math.max(2, scene.width >> 1),
                Math.max(2, scene.height >> 1),
              )
            )
              fed = false;
            // 2. Carry the field one step and feed it from the silhouette.
            if (clock.dt > 0 || !fed) {
              fed = true;
              kit.into(field.write);
              gl.useProgram(step.handle);
              kit.texture(0, field.read.texture);
              kit.texture(1, scene.texture);
              gl.uniform1i(step.loc("uField"), 0);
              gl.uniform1i(step.loc("uMatte"), 1);
              gl.uniform2f(
                step.loc("uTexel"),
                1 / field.read.width,
                1 / field.read.height,
              );
              gl.uniform1f(step.loc("uDt"), clock.dt);
              gl.uniform1f(step.loc("uTime"), clock.time % 97);
              gl.uniform1f(step.loc("uAspect"), kit.width / kit.height);
              kit.fill();
              field.swap();
              if (clock.dt > 0) glStats.steps++;
            }
            // 3. Colour it into the second target, which goes to the stage.
            kit.into(kit.aux);
            gl.useProgram(show.handle);
            kit.texture(0, field.read.texture);
            kit.texture(1, scene.texture);
            gl.uniform1i(show.loc("uField"), 0);
            gl.uniform1i(show.loc("uMatte"), 1);
            kit.fill();
            return kit.aux;
          },
          reset() {
            field.clear();
            fed = false;
          },
          dispose,
        };
      } catch (error) {
        dispose();
        throw error;
      }
    }),
};
export default aura;
