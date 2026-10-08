/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  createFramebuffer,
  createTexture,
  deleteFramebuffer,
  deleteTexture,
} from "./resources";

/** A texture you can render into. */
export type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};
/** Two targets that swap roles each step: read the last state, write the next. */
export type PingPong = {
  read: Target;
  write: Target;
  swap(): void;
  resize(width: number, height: number): boolean;
  clear(): void;
  dispose(): void;
};

/** True when this context can render into half-float textures, which keeps
 * additive light from clipping before the bloom pass. */
export function supportsFloatTargets(gl: WebGL2RenderingContext): boolean {
  try {
    return !!(
      gl.getExtension("EXT_color_buffer_float") ||
      gl.getExtension("EXT_color_buffer_half_float")
    );
  } catch {
    return false;
  }
}

function allocate(
  gl: WebGL2RenderingContext,
  target: Target,
  float: boolean,
  width: number,
  height: number,
) {
  target.width = width;
  target.height = height;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  if (float)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      width,
      height,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  else
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
}

/** Make a render target. `float` asks for RGBA16F; the caller passes the
 * result of supportsFloatTargets. Linear filtering, clamped edges. */
export function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  float: boolean,
): Target {
  const texture = createTexture(gl);
  let framebuffer: WebGLFramebuffer | null = null;
  try {
    framebuffer = createFramebuffer(gl);
    const target: Target = { texture, framebuffer, width: 0, height: 0 };
    allocate(gl, target, float, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost())
      throw new Error(
        `Render target ${width}x${height} is incomplete (status ${status}).`,
      );
    return target;
  } catch (error) {
    deleteFramebuffer(gl, framebuffer);
    deleteTexture(gl, texture);
    throw error;
  }
}

/** Reallocate storage when the size changed. Returns true if it did; the
 * contents are undefined afterwards, so the caller clears or redraws. */
export function resizeTarget(
  gl: WebGL2RenderingContext,
  target: Target,
  float: boolean,
  width: number,
  height: number,
): boolean {
  if (target.width === width && target.height === height) return false;
  allocate(gl, target, float, width, height);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return true;
}

export function disposeTarget(gl: WebGL2RenderingContext, target: Target) {
  deleteFramebuffer(gl, target.framebuffer);
  deleteTexture(gl, target.texture);
}

function wipe(gl: WebGL2RenderingContext, target: Target) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/** A feedback pair for state that evolves on the GPU (a flowing field). */
export function createPingPong(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  float: boolean,
): PingPong {
  const first = createTarget(gl, width, height, float);
  let second: Target;
  try {
    second = createTarget(gl, width, height, float);
  } catch (error) {
    disposeTarget(gl, first);
    throw error;
  }
  const pair: PingPong = {
    read: first,
    write: second,
    swap() {
      const held = pair.read;
      pair.read = pair.write;
      pair.write = held;
    },
    resize(w, h) {
      const a = resizeTarget(gl, pair.read, float, w, h),
        b = resizeTarget(gl, pair.write, float, w, h);
      if (a || b) pair.clear();
      return a || b;
    },
    clear() {
      wipe(gl, pair.read);
      wipe(gl, pair.write);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },
    dispose() {
      disposeTarget(gl, pair.read);
      disposeTarget(gl, pair.write);
    },
  };
  pair.clear();
  return pair;
}
