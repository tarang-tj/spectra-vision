/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createBloom } from "./bloom";
import type { Bloom } from "./bloom";
import { COMPOSITE_FRAGMENT } from "./bloom-shaders";
import { createFullscreen, createPass } from "./fullscreen";
import type { Fullscreen } from "./fullscreen";
import { createLineBatch } from "./lines";
import type { LineBatch } from "./lines";
import { exposeGlStats, forgetGlObjects } from "./resources";
import type { Program } from "./shader";
import {
  createTarget,
  disposeTarget,
  resizeTarget,
  supportsFloatTargets,
} from "./targets";
import type { Target } from "./targets";

/** What every GPU effect shares on the stage's one WebGL2 context: a scene
 * target to draw light into, a second one for post passes, the line batch,
 * the bloom chain and the pass that puts the result on the stage layer.
 * Shared so eight effects do not each hold full-size render targets. */
export type Kit = {
  gl: WebGL2RenderingContext;
  /** True on a software renderer (SwiftShader, llvmpipe). Effects use it as
   * the low-cost flag: fewer particles and a smaller scene, same look. */
  software: boolean;
  /** True when targets are half float. False means 8-bit targets. */
  float: boolean;
  /** Stage size in CSS pixels, valid after begin(). */
  width: number;
  height: number;
  scene: Target;
  aux: Target;
  lines: LineBatch;
  /** Start an effect's frame: size the shared targets, bind and clear the
   * scene and set additive blending. */
  begin(width: number, height: number): void;
  /** Render into a target from here on. */
  into(target: Target, clear?: boolean): void;
  /** Bind a texture to a unit. */
  texture(unit: number, texture: WebGLTexture | null): void;
  /** Run the bound program over the bound target. */
  fill(): void;
  /** Draw the batched lines into the bound target. */
  flush(solid?: boolean, core?: number): void;
  /** Bloom `source` (the scene unless given) and blend it onto the stage
   * layer, then restore the GL state the stage expects. */
  present(exposure: number, bloom: number, source?: Target): void;
  /** Restore GL state without presenting anything. */
  end(): void;
  /** Give the kit back. The shared objects are deleted with the last user. */
  release(): void;
};

type Shared = { kit: Kit; users: number; stop(): void };
const shared = new WeakMap<WebGL2RenderingContext, Shared>();

function isSoftware(gl: WebGL2RenderingContext): boolean {
  try {
    let name = String(gl.getParameter(gl.RENDERER) ?? "");
    if (!/angle|swiftshader|llvmpipe|software/i.test(name)) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      if (info) name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
    }
    return /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    return false;
  }
}

/** The shared kit for a context, created on first use. Call release() once
 * for every acquire. Throws a readable error if the context cannot build it. */
export function acquireKit(gl: WebGL2RenderingContext): Kit {
  const existing = shared.get(gl);
  if (existing) {
    existing.users++;
    return existing.kit;
  }
  exposeGlStats();
  const software = isSoftware(gl),
    float = supportsFloatTargets(gl),
    // Longest scene side in device pixels. Light is soft, so a smaller scene
    // costs little sharpness and saves most of the fill cost.
    limit = software ? 800 : 1920,
    built: { dispose(): void }[] = [];
  let fullscreen: Fullscreen,
    lines: LineBatch,
    bloom: Bloom,
    composite: Program;
  let scene: Target, aux: Target;
  const destroy = () => {
    for (const item of built) item.dispose();
    built.length = 0;
  };
  try {
    built.push((fullscreen = createFullscreen(gl)));
    built.push((lines = createLineBatch(gl)));
    built.push((bloom = createBloom(gl, fullscreen, float)));
    built.push((composite = createPass(gl, "composite", COMPOSITE_FRAGMENT)));
    scene = createTarget(gl, 2, 2, float);
    built.push({ dispose: () => disposeTarget(gl, scene) });
    aux = createTarget(gl, 2, 2, float);
    built.push({ dispose: () => disposeTarget(gl, aux) });
  } catch (error) {
    destroy();
    throw error;
  }
  const kit: Kit = {
    gl,
    software,
    float,
    width: 1,
    height: 1,
    scene,
    aux,
    lines,
    begin(width, height) {
      kit.width = width;
      kit.height = height;
      const bw = gl.drawingBufferWidth,
        bh = gl.drawingBufferHeight,
        scale = Math.min(1, limit / Math.max(bw, bh, 1)),
        w = Math.max(2, Math.round(bw * scale)),
        h = Math.max(2, Math.round(bh * scale));
      resizeTarget(gl, scene, float, w, h);
      resizeTarget(gl, aux, float, w, h);
      bloom.resize(w, h);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.STENCIL_TEST);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.colorMask(true, true, true, true);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      kit.into(scene, true);
    },
    into(target, clear = false) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, target.width, target.height);
      if (clear) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
      }
    },
    texture(unit, texture) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    },
    fill() {
      fullscreen.draw();
    },
    flush(solid = false, core = 0.6) {
      lines.flush(kit.width, kit.height, solid, core);
    },
    present(exposure, amount, source = scene) {
      bloom.run(source);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      // The layer is premultiplied: this is "over", so effects stack.
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(composite.handle);
      kit.texture(0, source.texture);
      kit.texture(1, bloom.levels[0].texture);
      kit.texture(2, bloom.levels[1].texture);
      kit.texture(3, bloom.levels[2].texture);
      gl.uniform1i(composite.loc("uScene"), 0);
      gl.uniform1i(composite.loc("uBloom0"), 1);
      gl.uniform1i(composite.loc("uBloom1"), 2);
      gl.uniform1i(composite.loc("uBloom2"), 3);
      gl.uniform1f(composite.loc("uExposure"), exposure);
      gl.uniform1f(composite.loc("uBloom"), amount);
      fullscreen.draw();
      kit.end();
    },
    end() {
      for (let unit = 3; unit >= 0; unit--) kit.texture(unit, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindVertexArray(null);
      gl.useProgram(null);
      gl.disable(gl.BLEND);
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.blendEquation(gl.FUNC_ADD);
    },
    release() {
      const entry = shared.get(gl);
      // A kit from before a context loss has nothing left to give back.
      if (!entry || entry.kit !== kit || --entry.users > 0) return;
      entry.stop();
      shared.delete(gl);
      destroy();
    },
  };
  // On a context loss the browser has destroyed every object already: drop
  // the shared kit without deleting, and build a new one on the next acquire.
  const canvas = gl.canvas as EventTarget;
  const onLost = () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    if (shared.get(gl)?.kit === kit) shared.delete(gl);
    forgetGlObjects();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  shared.set(gl, {
    kit,
    users: 1,
    stop: () => canvas.removeEventListener("webglcontextlost", onLost),
  });
  return kit;
}
