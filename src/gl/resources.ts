/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { testHooksEnabled } from "../test-hooks";

/** Every GL object the kit makes is created and deleted through this file, so
 * one set of counters can prove that switching effects and modes leaks nothing.
 * The stage has a single WebGL2 context, so the counters are module level. */
export type GlCounts = {
  programs: number;
  shaders: number;
  buffers: number;
  textures: number;
  framebuffers: number;
  vertexArrays: number;
  feedbacks: number;
};
type Kind = keyof GlCounts;

const counts: GlCounts = {
  programs: 0,
  shaders: 0,
  buffers: 0,
  textures: 0,
  framebuffers: 0,
  vertexArrays: 0,
  feedbacks: 0,
};
// Objects that are alive in the current context. A delete of anything else
// (an object from before a context loss) is ignored and not counted twice.
let alive = new WeakSet<object>();

/** Measured activity, read by tests: live objects and simulation steps run. */
export const glStats = {
  /** Particle and field simulation steps since load. Must not advance while
   * the stage is paused or the effect is off. */
  steps: 0,
  counts: (): GlCounts => ({ ...counts }),
  total: (): number =>
    counts.programs +
    counts.shaders +
    counts.buffers +
    counts.textures +
    counts.framebuffers +
    counts.vertexArrays +
    counts.feedbacks,
};

function made<T extends object>(value: T | null, kind: Kind, what: string): T {
  if (!value) throw new Error(`WebGL could not create a ${what}.`);
  alive.add(value);
  counts[kind]++;
  return value;
}
function gone(value: object | null, kind: Kind): boolean {
  if (!value || !alive.delete(value)) return false;
  counts[kind]--;
  return true;
}
type GL = WebGL2RenderingContext;

export const createProgramObject = (gl: GL) =>
  made(gl.createProgram(), "programs", "program");
export const createShaderObject = (gl: GL, type: number) =>
  made(gl.createShader(type), "shaders", "shader");
export const createBuffer = (gl: GL) =>
  made(gl.createBuffer(), "buffers", "buffer");
export const createTexture = (gl: GL) =>
  made(gl.createTexture(), "textures", "texture");
export const createFramebuffer = (gl: GL) =>
  made(gl.createFramebuffer(), "framebuffers", "framebuffer");
export const createVertexArray = (gl: GL) =>
  made(gl.createVertexArray(), "vertexArrays", "vertex array");
export const createFeedback = (gl: GL) =>
  made(gl.createTransformFeedback(), "feedbacks", "transform feedback");

export function deleteProgramObject(gl: GL, value: WebGLProgram | null) {
  if (gone(value, "programs")) gl.deleteProgram(value);
}
export function deleteShaderObject(gl: GL, value: WebGLShader | null) {
  if (gone(value, "shaders")) gl.deleteShader(value);
}
export function deleteBuffer(gl: GL, value: WebGLBuffer | null) {
  if (gone(value, "buffers")) gl.deleteBuffer(value);
}
export function deleteTexture(gl: GL, value: WebGLTexture | null) {
  if (gone(value, "textures")) gl.deleteTexture(value);
}
export function deleteFramebuffer(gl: GL, value: WebGLFramebuffer | null) {
  if (gone(value, "framebuffers")) gl.deleteFramebuffer(value);
}
export function deleteVertexArray(
  gl: GL,
  value: WebGLVertexArrayObject | null,
) {
  if (gone(value, "vertexArrays")) gl.deleteVertexArray(value);
}
export function deleteFeedback(gl: GL, value: WebGLTransformFeedback | null) {
  if (gone(value, "feedbacks")) gl.deleteTransformFeedback(value);
}

/** The context was lost: the browser has already destroyed every object. */
export function forgetGlObjects() {
  alive = new WeakSet<object>();
  for (const kind of Object.keys(counts) as Kind[]) counts[kind] = 0;
}

/** Make the counters readable from a test as `window.__spectraGl`, on a page
 * opened with `?spectra-test` only. */
export function exposeGlStats() {
  try {
    if (typeof window !== "undefined" && testHooksEnabled())
      Object.assign(window, { __spectraGl: glStats });
  } catch {
    /* A locked-down window only costs the test hook. */
  }
}
