/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The 3D view's renderer: coloured points on a WebGL2 canvas of its own, off
// the page. The mode copies that canvas onto the stage, so Screenshot and
// Record capture it. It owns no loop: it draws when asked. Every GL object
// goes through gl/resources.ts, so the leak counters see it.
import {
  createBuffer,
  createVertexArray,
  deleteBuffer,
  deleteVertexArray,
  exposeGlStats,
} from "../../gl/resources";
import { createProgram } from "../../gl/shader";

const VERTEX = `#version 300 es
in vec3 aPosition;
in vec4 aColor;
uniform mat4 uMatrix;
uniform float uSize;
out vec3 vColor;
void main() {
  gl_Position = uMatrix * vec4(aPosition, 1.0);
  gl_PointSize = uSize;
  vColor = aColor.rgb;
}`;
const FRAGMENT = `#version 300 es
precision mediump float;
in vec3 vColor;
out vec4 outColor;
void main() {
  outColor = vec4(vColor, 1.0);
}`;

export type CloudRenderer = {
  canvas: HTMLCanvasElement;
  /** True after the browser took the context away: make a new renderer. */
  lost(): boolean;
  /** Replace the points: x, y, z per point and RGBA bytes per point. */
  setPoints(positions: Float32Array, colors: Uint8Array, count: number): void;
  /** Draw at this size in device pixels with a column-major matrix. */
  draw(
    width: number,
    height: number,
    matrix: Float32Array,
    pointSize: number,
  ): void;
  dispose(): void;
};

/** A renderer, or null when this browser gives no WebGL2 context. */
export function createCloudRenderer(): CloudRenderer | null {
  const canvas = document.createElement("canvas"),
    gl = canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: true,
      stencil: false,
      preserveDrawingBuffer: false,
    });
  if (!gl) return null;
  exposeGlStats();
  let gone = false,
    count = 0;
  const onLost = () => {
    gone = true;
  };
  canvas.addEventListener("webglcontextlost", onLost);
  const program = createProgram(gl, "depth cloud", VERTEX, FRAGMENT),
    array = createVertexArray(gl),
    positionBuffer = createBuffer(gl),
    colorBuffer = createBuffer(gl),
    aPosition = gl.getAttribLocation(program.handle, "aPosition"),
    aColor = gl.getAttribLocation(program.handle, "aColor");
  gl.bindVertexArray(array);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(aColor);
  gl.vertexAttribPointer(aColor, 4, gl.UNSIGNED_BYTE, true, 0, 0);
  gl.bindVertexArray(null);
  return {
    canvas,
    lost: () => gone || gl.isContextLost(),
    setPoints(positions, colors, n) {
      count = n;
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    },
    draw(width, height, matrix, pointSize) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
      gl.clearColor(0, 0, 0, 0);
      gl.clearDepth(1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!count) return;
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.BLEND);
      gl.useProgram(program.handle);
      gl.uniformMatrix4fv(program.loc("uMatrix"), false, matrix);
      gl.uniform1f(program.loc("uSize"), pointSize);
      gl.bindVertexArray(array);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.bindVertexArray(null);
    },
    dispose() {
      canvas.removeEventListener("webglcontextlost", onLost);
      deleteVertexArray(gl, array);
      deleteBuffer(gl, positionBuffer);
      deleteBuffer(gl, colorBuffer);
      program.dispose();
      // Shrink the buffer and drop the context now instead of waiting for GC.
      canvas.width = 1;
      canvas.height = 1;
      try {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        /* The context is already gone. */
      }
    },
  };
}
