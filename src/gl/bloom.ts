/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { BLUR_FRAGMENT, DOWNSAMPLE_FRAGMENT } from "./bloom-shaders";
import { createPass } from "./fullscreen";
import type { Fullscreen } from "./fullscreen";
import type { Program } from "./shader";
import { createTarget, disposeTarget, resizeTarget } from "./targets";
import type { Target } from "./targets";

const LEVELS = 3;

/** A three-level bloom: each level is half the size of the one before and is
 * blurred in two directions. `levels` holds the blurred results. */
export type Bloom = {
  levels: Target[];
  /** Fit the chain to a scene of this size. */
  resize(width: number, height: number): void;
  /** Fill the levels from a scene texture. Leaves blending off. */
  run(scene: Target): void;
  dispose(): void;
};

export function createBloom(
  gl: WebGL2RenderingContext,
  fullscreen: Fullscreen,
  float: boolean,
): Bloom {
  const made: Target[] = [],
    programs: Program[] = [];
  const dispose = () => {
    for (const target of made) disposeTarget(gl, target);
    for (const program of programs) program.dispose();
    made.length = 0;
    programs.length = 0;
  };
  try {
    const down = createPass(gl, "bloom downsample", DOWNSAMPLE_FRAGMENT);
    programs.push(down);
    const blur = createPass(gl, "bloom blur", BLUR_FRAGMENT);
    programs.push(blur);
    // Two targets per level: the blur goes there and back.
    const levels: Target[] = [],
      scratch: Target[] = [];
    for (let i = 0; i < LEVELS; i++) {
      levels.push(createTarget(gl, 2, 2, float));
      made.push(levels[i]);
      scratch.push(createTarget(gl, 2, 2, float));
      made.push(scratch[i]);
    }
    const draw = (program: Program, from: Target, to: Target) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer);
      gl.viewport(0, 0, to.width, to.height);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.uniform1i(program.loc("uTex"), 0);
      fullscreen.draw();
    };
    return {
      levels,
      resize(width, height) {
        for (let i = 0; i < LEVELS; i++) {
          const w = Math.max(2, width >> (i + 1)),
            h = Math.max(2, height >> (i + 1));
          resizeTarget(gl, levels[i], float, w, h);
          resizeTarget(gl, scratch[i], float, w, h);
        }
      },
      run(scene) {
        gl.disable(gl.BLEND);
        gl.activeTexture(gl.TEXTURE0);
        let from = scene;
        for (let i = 0; i < LEVELS; i++) {
          const level = levels[i],
            other = scratch[i];
          gl.useProgram(down.handle);
          gl.uniform2f(down.loc("uTexel"), 0.5 / from.width, 0.5 / from.height);
          draw(down, from, level);
          gl.useProgram(blur.handle);
          gl.uniform2f(blur.loc("uStep"), 1 / level.width, 0);
          draw(blur, level, other);
          gl.uniform2f(blur.loc("uStep"), 0, 1 / level.height);
          draw(blur, other, level);
          from = level;
        }
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
