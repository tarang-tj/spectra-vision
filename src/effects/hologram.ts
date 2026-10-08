/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Rgb } from "../gl/color";
import { createPass } from "../gl/fullscreen";
import {
  captureFigures,
  createFigureSet,
  drawBones,
  drawSilhouette,
} from "./lib/figures";
import { DEFAULT_INTENSITY, glEffect } from "./lib/gl-effect";
import { HOLOGRAM_FRAGMENT } from "./lib/hologram-shaders";
import { matteOf } from "./lib/inputs";
import { createMatteLayer } from "./lib/matte-layer";
import { createSourceTexture } from "./lib/source-texture";
import type { EffectDef } from "./types";

// The scene is used as two data channels here, not as colour.
const BONES: Rgb = [1, 0, 0],
  BODY: Rgb = [0, 1, 0];

/** Hologram: with a segmentation mask, the person is cut out and shown as a
 * scan-lined, colour-split projection of their own pixels. Without a mask
 * there is no cutout: the tracked skeleton is projected instead, inside a
 * faint volume built around its bones. */
const hologram: EffectDef = {
  id: "hologram",
  label: "Hologram",
  modes: ["body", "hands", "gestures", "segment", "fusion"],
  kind: "gl",
  order: 50,
  intensity: { default: DEFAULT_INTENSITY },
  create: (env) =>
    glEffect(env, { id: "hologram", exposure: 1.25, bloom: 0.9 }, (kit) => {
      const gl = kit.gl,
        owned: { dispose(): void }[] = [],
        dispose = () => {
          for (const item of owned) item.dispose();
          owned.length = 0;
        };
      try {
        const pass = createPass(gl, "hologram", HOLOGRAM_FRAGMENT);
        owned.push(pass);
        const mask = createMatteLayer(gl);
        owned.push(mask);
        const source = createSourceTexture(gl);
        owned.push(source);
        const figures = createFigureSet();
        return {
          paint(frame, kit, _level, clock) {
            const matte = matteOf(frame),
              { rect, width, height } = frame;
            captureFigures(frame, figures);
            if (!matte && !figures.count) return null;
            if (matte) mask.draw(kit, frame, matte, 0, 1, 0);
            else {
              gl.blendEquation(gl.MAX);
              drawSilhouette(kit.lines, frame, figures, BODY, 0.7);
              kit.flush(true);
              gl.blendEquation(gl.FUNC_ADD);
            }
            drawBones(kit.lines, frame, figures, 0.09, BONES, 1);
            kit.flush(false, 0);
            // The person's own pixels are only used where a mask says who
            // the person is.
            const lit = matte ? source.update(frame) : false;
            gl.disable(gl.BLEND);
            kit.into(kit.aux);
            gl.useProgram(pass.handle);
            kit.texture(0, kit.scene.texture);
            kit.texture(1, lit ? source.texture : null);
            gl.uniform1i(pass.loc("uScene"), 0);
            gl.uniform1i(pass.loc("uSource"), 1);
            gl.uniform1f(pass.loc("uHasSource"), lit ? 1 : 0);
            gl.uniform1f(pass.loc("uCover"), matte ? 0.82 : 0);
            gl.uniform1f(pass.loc("uTime"), clock.time % 97);
            // One scan line every three CSS pixels.
            gl.uniform1f(pass.loc("uLines"), (height / 3) * Math.PI * 2);
            gl.uniform4f(
              pass.loc("uRect"),
              rect.x / width,
              rect.y / height,
              rect.w / width,
              rect.h / height,
            );
            gl.uniform1f(pass.loc("uMirror"), frame.mirror ? 1 : 0);
            kit.fill();
            return kit.aux;
          },
          dispose,
        };
      } catch (error) {
        dispose();
        throw error;
      }
    }),
};
export default hologram;
