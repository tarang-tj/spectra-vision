/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
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
  QUAD_FLOATS = 6 * STRIDE;

/** Batches glowing capsules, dots and ribbons into one draw call. Coordinates
 * and widths are CSS pixels; a width is the glow radius, and the bright core
 * is about a fifth of it. Colour is linear r, g, b plus a strength. The batch
 * reuses one array, so filling it every frame allocates nothing. Quads past
 * the capacity are dropped. */
export type LineBatch = {
  segment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    r: number,
    g: number,
    b: number,
    strength: number,
  ): void;
  dot(
    x: number,
    y: number,
    radius: number,
    r: number,
    g: number,
    b: number,
    strength: number,
  ): void;
  /** Start a ribbon: a strip with smooth joins and no round caps. */
  ribbon(): void;
  /** Add the next point of the ribbon started last. */
  point(
    x: number,
    y: number,
    width: number,
    r: number,
    g: number,
    b: number,
    strength: number,
  ): void;
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
  // A ribbon point is [x, y, width, r, g, b, strength]. The ribbon keeps its
  // last two points and the normal at the older one; a piece is emitted once
  // the point after it is known, so each join faces along its neighbours.
  const older = new Float32Array(7),
    newer = new Float32Array(7);
  let count = 0,
    olderNx = 0,
    olderNy = 0;

  // One corner: position, then (along, across, length) for the fragment shader.
  const corner = (
    x: number,
    y: number,
    along: number,
    across: number,
    length: number,
    c: Float32Array,
  ) => {
    data[used++] = x;
    data[used++] = y;
    data[used++] = along;
    data[used++] = across;
    data[used++] = length;
    data[used++] = c[3];
    data[used++] = c[4];
    data[used++] = c[5];
    data[used++] = c[6];
  };
  const full = () => used + QUAD_FLOATS > data.length;
  const piece = (
    a: Float32Array,
    b: Float32Array,
    bnx: number,
    bny: number,
  ) => {
    if (full()) return;
    const ax = olderNx * a[2],
      ay = olderNy * a[2],
      bx = bnx * b[2],
      by = bny * b[2];
    corner(a[0] + ax, a[1] + ay, 0.5, 1, 1, a);
    corner(a[0] - ax, a[1] - ay, 0.5, -1, 1, a);
    corner(b[0] + bx, b[1] + by, 0.5, 1, 1, b);
    corner(b[0] + bx, b[1] + by, 0.5, 1, 1, b);
    corner(a[0] - ax, a[1] - ay, 0.5, -1, 1, a);
    corner(b[0] - bx, b[1] - by, 0.5, -1, 1, b);
  };
  // Emit the last piece of the open ribbon, whose end has no further neighbour.
  const finish = () => {
    if (count >= 2) {
      const dx = newer[0] - older[0],
        dy = newer[1] - older[1],
        span = Math.hypot(dx, dy) || 1;
      piece(older, newer, -dy / span, dx / span);
    }
    count = 0;
  };
  const one = new Float32Array(7);

  return {
    segment(x0, y0, x1, y1, width, r, g, b, strength) {
      finish();
      if (full() || width <= 0 || strength <= 0) return;
      let dx = x1 - x0,
        dy = y1 - y0;
      const length = Math.hypot(dx, dy);
      if (length > 1e-4) {
        dx /= length;
        dy /= length;
      } else {
        dx = 1;
        dy = 0;
      }
      const ex = dx * width,
        ey = dy * width,
        nx = -dy * width,
        ny = dx * width,
        span = length / width;
      one[3] = r;
      one[4] = g;
      one[5] = b;
      one[6] = strength;
      corner(x0 - ex + nx, y0 - ey + ny, -1, 1, span, one);
      corner(x0 - ex - nx, y0 - ey - ny, -1, -1, span, one);
      corner(x1 + ex + nx, y1 + ey + ny, span + 1, 1, span, one);
      corner(x1 + ex + nx, y1 + ey + ny, span + 1, 1, span, one);
      corner(x0 - ex - nx, y0 - ey - ny, -1, -1, span, one);
      corner(x1 + ex - nx, y1 + ey - ny, span + 1, -1, span, one);
    },
    dot(x, y, radius, r, g, b, strength) {
      this.segment(x, y, x, y, radius, r, g, b, strength);
    },
    ribbon: finish,
    point(x, y, width, r, g, b, strength) {
      if (count > 0 && Math.hypot(x - newer[0], y - newer[1]) < 0.01) return;
      if (count > 0) {
        const from = count > 1 ? older : newer,
          dx = x - from[0],
          dy = y - from[1],
          span = Math.hypot(dx, dy) || 1,
          nx = -dy / span,
          ny = dx / span;
        if (count > 1) piece(older, newer, nx, ny);
        older.set(newer);
        olderNx = nx;
        olderNy = ny;
      }
      newer[0] = x;
      newer[1] = y;
      newer[2] = width;
      newer[3] = r;
      newer[4] = g;
      newer[5] = b;
      newer[6] = strength;
      count++;
    },
    flush(width, height, solid = false, core = 0.6) {
      finish();
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
