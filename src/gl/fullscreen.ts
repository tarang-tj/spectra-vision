/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createVertexArray, deleteVertexArray } from "./resources";
import { createProgram } from "./shader";
import type { Program } from "./shader";

/** One triangle that covers the target, built from gl_VertexID so it needs no
 * buffer. vUv runs 0..1 with the origin at the bottom left. */
export const FULLSCREEN_VERTEX = `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/** A fragment shader run over a whole target. */
export const createPass = (
  gl: WebGL2RenderingContext,
  name: string,
  fragment: string,
): Program => createProgram(gl, name, FULLSCREEN_VERTEX, fragment);

export type Fullscreen = { draw(): void; dispose(): void };

/** The empty vertex array the fullscreen triangle is drawn with. */
export function createFullscreen(gl: WebGL2RenderingContext): Fullscreen {
  const vao = createVertexArray(gl);
  return {
    draw() {
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      deleteVertexArray(gl, vao);
    },
  };
}
