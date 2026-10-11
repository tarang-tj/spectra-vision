/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  runWorker,
  visionGlobals,
  workerSource,
} from "./helpers/worker-harness";

// The real worker script with a stand-in GPU: when the browser's graphics
// process ends, MediaPipe does not throw, it returns empty results. The worker
// must say so, so that the page restarts the task on CPU.
const source = workerSource("vision-worker.js");
type Posted = Record<string, unknown>;

function startWorker(gpu: { lost: boolean }) {
  const posted: Posted[] = [];
  class Canvas {
    getContext(kind: string) {
      if (kind !== "webgl2") return { drawImage() {} };
      return {
        UNMASKED_RENDERER: 1,
        getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 1 }),
        getParameter: () => "ANGLE (Apple, ANGLE Metal Renderer: Apple M3)",
        isContextLost: () => gpu.lost,
      };
    }
  }
  const Detector = {
    createFromOptions: async () => ({
      setOptions: async () => {},
      detectForVideo: () => ({ detections: [] }),
    }),
  };
  const { send } = runWorker(
    source,
    {
      ...visionGlobals({ ObjectDetector: Detector }, Canvas),
      performance: { now: () => 0 },
    },
    (message) => posted.push(message),
  );
  return { posted, send };
}
const frame = (time: number) => ({
  type: "frame",
  bitmap: { width: 100, height: 50, close() {} },
  generation: 1,
  confidence: 0.5,
  time,
});
const init = (delegate: "CPU" | "GPU") => ({
  type: "init",
  base: "/",
  task: { kind: "object", model: "m", options: {}, delegate },
});
const types = (posted: Posted[]) => posted.map((p) => p.type);

describe("a lost GPU in the worker", () => {
  it("is reported as an error instead of an empty result", async () => {
    const gpu = { lost: false },
      w = startWorker(gpu);
    await w.send(init("GPU"));
    await w.send(frame(10));
    expect(types(w.posted)).toEqual(["downloaded", "ready", "result"]);
    gpu.lost = true;
    await w.send(frame(20));
    const last = w.posted[w.posted.length - 1];
    expect(last.type).toBe("error");
    expect(String(last.error)).toMatch(/GPU context was lost/);
  });
  it("is not watched for a CPU task", async () => {
    const gpu = { lost: true },
      w = startWorker(gpu);
    await w.send(init("CPU"));
    await w.send(frame(10));
    expect(types(w.posted)).toEqual(["downloaded", "ready", "result"]);
  });
});
