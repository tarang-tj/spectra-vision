/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { acquireKit } from "../../gl/kit";
import type { Kit } from "../../gl/kit";
import type { Target } from "../../gl/targets";
import type { Frame } from "../../vision/frame";
import type { EffectEnv, EffectInstance } from "../types";
import { effectIntensity } from "./intensity";

/** Starting intensity of every GPU effect; the look is tuned at this value. */
export const DEFAULT_INTENSITY = 0.7;

/** Effect time in seconds. `time` and `dt` advance only while the stage
 * animates, so simulations and flicker hold still when paused or under
 * reduced motion. `live` advances whenever the stage is not paused: it dates
 * model results, whose motion is the user's own and not decoration. */
export type Clock = { time: number; dt: number; live: number };

/** The part of a GPU effect that differs from one effect to the next. */
export type Painter = {
  /** Draw this frame's light into the kit's scene, which is bound, cleared
   * and set to additive blending. Return the target to put on the stage, or
   * null when the frame holds none of the inputs the effect needs. */
  paint(frame: Frame, kit: Kit, level: number, clock: Clock): Target | null;
  /** Forget accumulated state: the source changed or the user pressed Clear. */
  reset?(): void;
  dispose(): void;
};
export type GlEffectOptions = {
  id: string;
  /** Brightness at the default intensity. */
  exposure?: number;
  /** How much of the blurred light is added back. */
  bloom?: number;
};

/** Wrap a painter into an EffectInstance. This owns everything the effects
 * have in common: building GL objects lazily (never while the context is
 * lost), sharing the kit, the animation clock, reading the intensity, putting
 * the result on the stage layer, and leaving GL state clean on any error. */
export function glEffect(
  env: EffectEnv,
  options: GlEffectOptions,
  build: (kit: Kit) => Painter,
): EffectInstance {
  const gl = env.gl,
    clock: Clock = { time: 0, dt: 0, live: 0 },
    exposure = options.exposure ?? 1,
    bloom = options.bloom ?? 1;
  let kit: Kit | null = null,
    painter: Painter | null = null;
  return {
    draw(frame) {
      if (!gl || gl.isContextLost()) return;
      const level = effectIntensity(options.id, DEFAULT_INTENSITY);
      if (level <= 0) return;
      if (!kit || !painter) {
        const acquired = acquireKit(gl);
        try {
          painter = build(acquired);
          kit = acquired;
        } catch (error) {
          acquired.release();
          throw error;
        }
      }
      clock.dt = frame.animate ? Math.min(frame.dt, 100) / 1000 : 0;
      clock.time += clock.dt;
      clock.live += Math.min(frame.dt, 100) / 1000;
      try {
        kit.begin(frame.width, frame.height);
        const shown = painter.paint(frame, kit, level, clock);
        if (shown)
          kit.present((exposure * level) / DEFAULT_INTENSITY, bloom, shown);
        else kit.end();
      } catch (error) {
        // The host switches a throwing effect off; do not leave the shared
        // context mid-pass for the effects that are still running.
        kit.end();
        throw error;
      }
    },
    reset() {
      painter?.reset?.();
    },
    dispose() {
      try {
        painter?.dispose();
      } finally {
        painter = null;
        kit?.release();
        kit = null;
      }
    },
  };
}
