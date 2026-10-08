/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  createProgramObject,
  createShaderObject,
  deleteProgramObject,
  deleteShaderObject,
} from "./resources";

/** A linked program with cached uniform locations. */
export type Program = {
  handle: WebGLProgram;
  /** Uniform location by name, looked up once. Null when the compiler
   * removed the uniform, which GL treats as a silent no-op. */
  loc(name: string): WebGLUniformLocation | null;
  dispose(): void;
};

/** Turn a driver log into something a person can act on: which shader, which
 * stage, and the source lines the log points at. Pure, so it is unit-tested. */
export function describeShaderError(
  name: string,
  stage: string,
  log: string,
  source: string,
): string {
  const lines = source.split("\n"),
    wanted = new Set<number>();
  // Driver logs look like "ERROR: 0:12: 'x' : undeclared identifier".
  for (const match of log.matchAll(/\b\d+:(\d+)/g)) {
    const line = Number(match[1]);
    for (let n = line - 1; n <= line + 1; n++)
      if (n >= 1 && n <= lines.length) wanted.add(n);
  }
  const excerpt = [...wanted]
    .sort((a, b) => a - b)
    .map((n) => `${String(n).padStart(4)} | ${lines[n - 1]}`)
    .join("\n");
  const detail = log.trim() || "the driver gave no log";
  return `Shader "${name}" (${stage}) failed: ${detail}${excerpt ? `\n${excerpt}` : ""}`;
}

function compile(
  gl: WebGL2RenderingContext,
  name: string,
  type: number,
  source: string,
): WebGLShader {
  const shader = createShaderObject(gl, type),
    stage = type === gl.VERTEX_SHADER ? "vertex" : "fragment";
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "";
    deleteShaderObject(gl, shader);
    throw new Error(describeShaderError(name, stage, log, source));
  }
  return shader;
}

/** Compile and link. `varyings` names the transform feedback outputs, for
 * programs that update particles. Throws a readable error on failure and
 * leaves nothing allocated behind. */
export function createProgram(
  gl: WebGL2RenderingContext,
  name: string,
  vertex: string,
  fragment: string,
  varyings?: string[],
): Program {
  const vs = compile(gl, name, gl.VERTEX_SHADER, vertex);
  let fs: WebGLShader | null = null,
    handle: WebGLProgram | null = null;
  try {
    fs = compile(gl, name, gl.FRAGMENT_SHADER, fragment);
    handle = createProgramObject(gl);
    gl.attachShader(handle, vs);
    gl.attachShader(handle, fs);
    if (varyings)
      gl.transformFeedbackVaryings(handle, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(handle);
    if (!gl.getProgramParameter(handle, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(handle)?.trim();
      throw new Error(
        `Shader "${name}" failed to link: ${log || "the driver gave no log"}`,
      );
    }
  } catch (error) {
    deleteProgramObject(gl, handle);
    throw error;
  } finally {
    // A linked program keeps its own copy: the shader objects can go now.
    deleteShaderObject(gl, vs);
    deleteShaderObject(gl, fs);
  }
  const program = handle,
    cache = new Map<string, WebGLUniformLocation | null>();
  return {
    handle: program,
    loc(uniform) {
      let found = cache.get(uniform);
      if (found === undefined) {
        found = gl.getUniformLocation(program, uniform);
        cache.set(uniform, found);
      }
      return found;
    },
    dispose() {
      cache.clear();
      deleteProgramObject(gl, program);
    },
  };
}
