/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createPass } from "../../gl/fullscreen";
import type { Kit } from "../../gl/kit";
import { createTexture, deleteTexture } from "../../gl/resources";
import type { Frame } from "../../vision/frame";
import type { Matte } from "./inputs";

// The matte is in image space, rows from the top; the pass maps each stage
// pixel back into it through the letterbox rectangle and the mirror setting.
const MATTE_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform sampler2D uMatte;
uniform vec4 uRect;
uniform float uMirror;
uniform vec3 uColor;
void main() {
  vec2 q = (vec2(vUv.x, 1.0 - vUv.y) - uRect.xy) / uRect.zw;
  if (uMirror > 0.5) q.x = 1.0 - q.x;
  float inside = step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
  float a = smoothstep(0.3, 0.7, texture(uMatte, q).r) * inside;
  o = vec4(uColor * a, 0.0);
}`;

/** Draws the segmenter's person matte into the bound target, where the
 * person is on the stage. The bytes are uploaded once per model result. */
export type MatteLayer = {
  draw(
    kit: Kit,
    frame: Frame,
    matte: Matte,
    r: number,
    g: number,
    b: number,
  ): void;
  dispose(): void;
};

export function createMatteLayer(gl: WebGL2RenderingContext): MatteLayer {
  const program = createPass(gl, "segmentation matte", MATTE_FRAGMENT);
  let texture: WebGLTexture;
  try {
    texture = createTexture(gl);
  } catch (error) {
    program.dispose();
    throw error;
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  // The buffer of the last upload: a new result brings a new one.
  let uploaded: Uint8Array | null = null;
  return {
    draw(kit, frame, matte, r, g, b) {
      kit.texture(0, texture);
      if (matte.alpha !== uploaded) {
        uploaded = matte.alpha;
        // One byte per pixel: rows are not padded to four bytes.
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R8,
          matte.width,
          matte.height,
          0,
          gl.RED,
          gl.UNSIGNED_BYTE,
          matte.alpha,
        );
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      }
      const { rect, width, height } = frame;
      gl.useProgram(program.handle);
      gl.uniform1i(program.loc("uMatte"), 0);
      gl.uniform4f(
        program.loc("uRect"),
        rect.x / width,
        rect.y / height,
        rect.w / width,
        rect.h / height,
      );
      gl.uniform1f(program.loc("uMirror"), frame.mirror ? 1 : 0);
      gl.uniform3f(program.loc("uColor"), r, g, b);
      kit.fill();
    },
    dispose() {
      uploaded = null;
      deleteTexture(gl, texture);
      program.dispose();
    },
  };
}
