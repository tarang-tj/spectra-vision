/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { glStats } from "../src/gl/resources";
import { createCloudRenderer } from "../src/modes/lib/depth-cloud";

// The 3D view's renderer against a stand-in WebGL2 context that counts what
// is made and deleted. The unit suite has no browser, so the context is the
// stand-in; the renderer, the program builder and the leak counters are the
// real ones. The real context is exercised in tests/e2e/depth.spec.ts.
function standIn(options: { compiles: boolean; buffers?: number }) {
  const listeners = new Set<unknown>(),
    live = new Set<object>(),
    state = { lost: 0, buffersLeft: options.buffers ?? Infinity },
    make = (kind: string) => {
      const value = { kind };
      live.add(value);
      return value;
    },
    drop = (value: object) => void live.delete(value),
    gl = {
      VERTEX_SHADER: 1,
      FRAGMENT_SHADER: 2,
      COMPILE_STATUS: 3,
      LINK_STATUS: 4,
      createShader: () => make("shader"),
      createProgram: () => make("program"),
      createVertexArray: () => make("vertex array"),
      createBuffer: () => (state.buffersLeft-- > 0 ? make("buffer") : null),
      deleteShader: drop,
      deleteProgram: drop,
      deleteVertexArray: drop,
      deleteBuffer: drop,
      shaderSource() {},
      compileShader() {},
      getShaderParameter: () => options.compiles,
      getShaderInfoLog: () => "ERROR: 0:3: stand-in compile failure",
      attachShader() {},
      linkProgram() {},
      getProgramParameter: () => true,
      getAttribLocation: () => 0,
      bindVertexArray() {},
      bindBuffer() {},
      enableVertexAttribArray() {},
      vertexAttribPointer() {},
      isContextLost: () => false,
      getExtension: (name: string) =>
        name === "WEBGL_lose_context"
          ? { loseContext: () => void state.lost++ }
          : null,
    },
    canvas = {
      width: 300,
      height: 150,
      getContext: () => gl,
      addEventListener: (_type: string, fn: unknown) => listeners.add(fn),
      removeEventListener: (_type: string, fn: unknown) => listeners.delete(fn),
    };
  vi.stubGlobal("document", { createElement: () => canvas });
  return { listeners, live, state, canvas };
}
afterEach(() => vi.unstubAllGlobals());

describe("the 3D view's renderer", () => {
  it("holds a program, a vertex array and two buffers, and gives them all back", () => {
    const before = glStats.total(),
      env = standIn({ compiles: true }),
      renderer = createCloudRenderer()!;
    expect(glStats.total() - before).toBe(4);
    expect(env.live.size).toBe(4);
    expect(env.listeners.size).toBe(1);
    renderer.dispose();
    expect(glStats.total()).toBe(before);
    expect(env.live.size).toBe(0);
    expect(env.listeners.size).toBe(0);
    expect(env.state.lost).toBe(1);
    expect(env.canvas.width).toBe(1);
  });

  it("leaves nothing behind when the point program does not compile", () => {
    const before = glStats.total(),
      env = standIn({ compiles: false });
    expect(() => createCloudRenderer()).toThrow(/depth cloud.*failed/);
    expect(glStats.total()).toBe(before);
    expect(env.live.size).toBe(0);
    // The context is dropped and its listener removed, not left for GC.
    expect(env.listeners.size).toBe(0);
    expect(env.state.lost).toBe(1);
    expect(env.canvas.width).toBe(1);
  });

  it("leaves nothing behind when the context refuses a buffer part way", () => {
    const before = glStats.total(),
      env = standIn({ compiles: true, buffers: 1 });
    expect(() => createCloudRenderer()).toThrow(/could not create a buffer/);
    expect(glStats.total()).toBe(before);
    expect(env.live.size).toBe(0);
    expect(env.listeners.size).toBe(0);
    expect(env.state.lost).toBe(1);
  });
});
