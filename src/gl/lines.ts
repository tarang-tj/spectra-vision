/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Rgb } from "./color";
import { LINE_FRAGMENT, LINE_VERTEX } from "./line-shaders";
import {
  createBuffer,
  createVertexArray,
  deleteBuffer,
  deleteVertexArray,
} from "./resources";
import { createProgram } from "./shader";

const MAX_QUADS = 4096,
  STRIDE = 9,
  QUAD_FLOATS = 6 * STRIDE,
  PATH_POINTS = 256;
// The six corners of a quad as two triangles: which end, which side.
const END = [0, 0, 1, 1, 0, 1],
  SIDE = [1, -1, 1, 1, -1, -1];

/** Batches glowing capsules, dots and ribbons into one draw call. Coordinates
 * and widths are CSS pixels; a width is the glow radius, and the bright core
 * is about a fifth of it. The batch reuses its arrays and its inner loops
 * call nothing, so filling it every frame allocates nothing (a number passed
 * through a function call can cost a heap allocation each; a ribbon is
 * therefore handed over as an array, not point by point). Quads past the
 * capacity are dropped. */
export type LineBatch = {
  segment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: Rgb,
    strength: number,
  ): void;
  dot(x: number, y: number, radius: number, color: Rgb, strength: number): void;
  /** Scratch for the next ribbon: x, y, width, strength per point. Fill the
   * first points of it, then call strip(). Holds PATH_POINTS points. */
  path: Float32Array;
  /** Batch the first `count` points of `path` as one ribbon: a strip with
   * smooth joins and no round caps. */
  strip(count: number, color: Rgb): void;
  /** Draw what was batched into the bound target and empty the batch.
   * `solid` draws mattes; `core` is how white the hot centre is (0..1). */
  flush(width: number, height: number, solid?: boolean, core?: number): void;
  dispose(): void;
};

export function createLineBatch(gl: WebGL2RenderingContext): LineBatch {
  const program = createProgram(gl, "glow lines", LINE_VERTEX, LINE_FRAGMENT);
  let vao: WebGLVertexArrayObject | null = null,
    buffer: WebGLBuffer | null = null;
  const dispose = () => {
    deleteVertexArray(gl, vao);
    deleteBuffer(gl, buffer);
    program.dispose();
  };
  try {
    vao = createVertexArray(gl);
    buffer = createBuffer(gl);
  } catch (error) {
    dispose();
    throw error;
  }
  const data = new Float32Array(MAX_QUADS * QUAD_FLOATS),
    bytes = Float32Array.BYTES_PER_ELEMENT;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE * bytes, 0);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, STRIDE * bytes, 2 * bytes);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * bytes, 5 * bytes);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  let used = 0;
  const path = new Float32Array(PATH_POINTS * 4);

  return {
    path,
    segment(x0, y0, x1, y1, width, color, strength) {
      if (used + QUAD_FLOATS > data.length || width <= 0 || strength <= 0)
        return;
      let dx = x1 - x0,
        dy = y1 - y0;
      const length = Math.sqrt(dx * dx + dy * dy);
      if (length > 1e-4) {
        dx /= length;
        dy /= length;
      } else {
        dx = 1;
        dy = 0;
      }
      const span = length / width;
      for (let k = 0; k < 6; k++) {
        // Each end is pushed out by the width so the cap has room.
        const end = END[k],
          side = SIDE[k],
          out = end ? width : -width;
        data[used++] = (end ? x1 : x0) + dx * out - dy * width * side;
        data[used++] = (end ? y1 : y0) + dy * out + dx * width * side;
        data[used++] = end ? span + 1 : -1;
        data[used++] = side;
        data[used++] = span;
        data[used++] = color[0];
        data[used++] = color[1];
        data[used++] = color[2];
        data[used++] = strength;
      }
    },
    dot(x, y, radius, color, strength) {
      this.segment(x, y, x, y, radius, color, strength);
    },
    strip(count, color) {
      const n = Math.min(count, PATH_POINTS);
      // Offsets of the previous point's two edges, and whether it has them.
      let px = 0,
        py = 0,
        pnx = 0,
        pny = 0,
        ps = 0,
        open = false;
      for (let i = 0; i < n; i++) {
        // The join at a point faces along its two neighbours.
        const a = Math.max(0, i - 1) * 4,
          b = Math.min(n - 1, i + 1) * 4,
          x = path[i * 4],
          y = path[i * 4 + 1],
          w = path[i * 4 + 2],
          s = path[i * 4 + 3],
          tx = path[b] - path[a],
          ty = path[b + 1] - path[a + 1],
          length = Math.sqrt(tx * tx + ty * ty);
        // Neighbours half a pixel apart give no usable direction.
        if (length < 0.5) continue;
        const nx = (-ty / length) * w,
          ny = (tx / length) * w;
        if (open && used + QUAD_FLOATS <= data.length)
          for (let k = 0; k < 6; k++) {
            const end = END[k],
              side = SIDE[k];
            data[used++] = end ? x + nx * side : px + pnx * side;
            data[used++] = end ? y + ny * side : py + pny * side;
            data[used++] = 0.5;
            data[used++] = side;
            data[used++] = 1;
            data[used++] = color[0];
            data[used++] = color[1];
            data[used++] = color[2];
            data[used++] = end ? s : ps;
          }
        px = x;
        py = y;
        pnx = nx;
        pny = ny;
        ps = s;
        open = true;
      }
    },
    flush(width, height, solid = false, core = 0.6) {
      if (!used) return;
      gl.useProgram(program.handle);
      gl.uniform2f(program.loc("uRes"), width, height);
      gl.uniform1f(program.loc("uShape"), solid ? 1 : 0);
      gl.uniform1f(program.loc("uCore"), core);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, used);
      gl.drawArrays(gl.TRIANGLES, 0, used / STRIDE);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindVertexArray(null);
      used = 0;
    },
    dispose,
  };
}
