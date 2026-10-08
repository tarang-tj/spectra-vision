/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  createBuffer,
  createFeedback,
  createVertexArray,
  deleteBuffer,
  deleteFeedback,
  deleteVertexArray,
  glStats,
} from "./resources";
import { createProgram } from "./shader";
import type { Program } from "./shader";

/** Floats per particle: two vec4 attributes, `aA` and `aB`. What they mean is
 * up to the shaders (position and velocity, then life, span and seeds). */
export const PARTICLE_FLOATS = 8;

export type ParticleSpec = {
  name: string;
  count: number;
  /** Vertex shader that reads `aA`, `aB` and writes the next state to the
   * varyings `vA`, `vB`. It runs with rasterization off. */
  update: string;
  /** Shaders that draw one point per particle from `aA`, `aB`. */
  vertex: string;
  fragment: string;
  /** Write the starting state of particle `index` at `offset` in `out`. */
  seed(index: number, out: Float32Array, offset: number): void;
};

/** A particle system that lives on the GPU: transform feedback moves the
 * state between two buffers, so a step costs no CPU work per particle and
 * nothing is read back. */
export type Particles = {
  count: number;
  update: Program;
  render: Program;
  /** Advance one step. Bind `update` and set its uniforms first. */
  step(): void;
  /** Draw the points. Bind `render` and set its uniforms first. */
  draw(): void;
  /** Return every particle to its starting state. */
  reset(): void;
  dispose(): void;
};

const NO_OUTPUT = `#version 300 es
precision lowp float;
void main() {}`;

export function createParticles(
  gl: WebGL2RenderingContext,
  spec: ParticleSpec,
): Particles {
  const programs: Program[] = [],
    buffers: WebGLBuffer[] = [],
    arrays: WebGLVertexArrayObject[] = [],
    feedbacks: WebGLTransformFeedback[] = [];
  const dispose = () => {
    for (const program of programs) program.dispose();
    for (const buffer of buffers) deleteBuffer(gl, buffer);
    for (const array of arrays) deleteVertexArray(gl, array);
    for (const feedback of feedbacks) deleteFeedback(gl, feedback);
    programs.length = buffers.length = arrays.length = feedbacks.length = 0;
  };
  const bytes = Float32Array.BYTES_PER_ELEMENT,
    stride = PARTICLE_FLOATS * bytes;
  // The start state is rebuilt on reset, not kept: it is megabytes at 20k.
  const upload = () => {
    const start = new Float32Array(spec.count * PARTICLE_FLOATS);
    for (let i = 0; i < spec.count; i++)
      spec.seed(i, start, i * PARTICLE_FLOATS);
    for (const buffer of buffers) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, start, gl.DYNAMIC_COPY);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  };
  try {
    const update = createProgram(
      gl,
      `${spec.name} update`,
      spec.update,
      NO_OUTPUT,
      ["vA", "vB"],
    );
    programs.push(update);
    const render = createProgram(
      gl,
      `${spec.name} render`,
      spec.vertex,
      spec.fragment,
    );
    programs.push(render);
    // Both programs must agree on where the two attributes live.
    for (const program of programs) {
      const a = gl.getAttribLocation(program.handle, "aA"),
        b = gl.getAttribLocation(program.handle, "aB");
      if ((a !== 0 && a !== -1) || (b !== 1 && b !== -1))
        throw new Error(
          `${spec.name}: declare aA at location 0 and aB at location 1.`,
        );
    }
    for (let i = 0; i < 2; i++) buffers.push(createBuffer(gl));
    upload();
    for (let i = 0; i < 2; i++) {
      const array = createVertexArray(gl);
      arrays.push(array);
      gl.bindVertexArray(array);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[i]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, stride, 4 * bytes);
      const feedback = createFeedback(gl);
      feedbacks.push(feedback);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedback);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, buffers[i]);
    }
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // Index of the buffer that holds the current state.
    let current = 0;
    return {
      count: spec.count,
      update,
      render,
      step() {
        const next = 1 - current;
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindVertexArray(arrays[current]);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, feedbacks[next]);
        gl.enable(gl.RASTERIZER_DISCARD);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, spec.count);
        gl.endTransformFeedback();
        gl.disable(gl.RASTERIZER_DISCARD);
        gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
        gl.bindVertexArray(null);
        current = next;
        glStats.steps++;
      },
      draw() {
        gl.bindVertexArray(arrays[current]);
        gl.drawArrays(gl.POINTS, 0, spec.count);
        gl.bindVertexArray(null);
      },
      reset: upload,
      dispose,
    };
  } catch (error) {
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindVertexArray(null);
    dispose();
    throw error;
  }
}
