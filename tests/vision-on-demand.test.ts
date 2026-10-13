/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createOnDemand,
  onDemandState,
  onOnDemandState,
  type OnDemandTask,
} from "../src/vision/on-demand";
import type { TaskRunner } from "../src/vision/task-runner";
import type {
  Source,
  TaskResult,
  TaskSpec,
  VisionResult,
} from "../src/vision/types";

// A task a mode runs only when it is wanted (Objects' depth map for Measure
// objects), driven here with a worker that is a plain object.
const spec: TaskSpec = {
  kind: "depth",
  model: "depth.onnx",
  options: {},
  delegate: "CPU",
};
type Message = { type: string; generation?: number };
type Fake = {
  posted: Message[];
  terminated: boolean;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
  reply(d: unknown): void;
};
const photo = (generation: number) =>
  ({
    element: { naturalWidth: 800, naturalHeight: 600 },
    kind: "image",
    label: "photo",
    generation,
  }) as unknown as Source;
const depthResult = (generation: number, latency = 900) =>
  ({
    kind: "depth",
    generation,
    time: 1,
    latency,
    detections: [],
    landmarks: [],
    handedness: [],
  }) as unknown as TaskResult;
const shown = (generation: number): VisionResult => ({
  mode: "objects",
  generation,
  time: 40,
  latency: 80,
  detections: [],
  landmarks: [],
  handedness: [],
  tasks: { object: { kind: "object", generation, latency: 80 } as TaskResult },
});

function harness(wanted: { value: boolean }) {
  const workers: Fake[] = [],
    listeners = new Set<() => void>(),
    task: OnDemandTask = {
      spec,
      wanted: () => wanted.value,
      subscribe(listener) {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    hooks = {
      changed: vi.fn(),
      // What the page does with a claimed runner: read the frame, send it.
      feed: (runner: TaskRunner, generation: number) =>
        runner.send({ close() {} } as ImageBitmap, 0, generation, 0.5),
      unavailable: vi.fn(),
    },
    demand = createOnDemand([task], "http://x/", hooks, () => {
      const fake: Fake = {
        posted: [],
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage(m) {
          this.posted.push(m as Message);
        },
        terminate() {
          this.terminated = true;
        },
        reply(d) {
          this.onmessage?.({ data: d } as MessageEvent);
        },
      };
      workers.push(fake);
      return fake;
    });
  let time = 0;
  return {
    workers,
    hooks,
    demand,
    flip(next: boolean) {
      wanted.value = next;
      listeners.forEach((listener) => listener());
    },
    listeners,
    /** A hundred drawn frames, 100 ms apart. */
    ticks(source: Source | null, count = 100) {
      for (let i = 0; i < count; i++) demand.tick((time += 100), source, false);
    },
    frames: (w: Fake) => w.posted.filter((m) => m.type === "frame"),
  };
}

let open: { dispose(): void } | null = null;
const start = (on: boolean) => {
  const h = harness({ value: on });
  open = h.demand;
  return h;
};
afterEach(() => {
  open?.dispose();
  open = null;
});

describe("a task that runs only on demand", () => {
  it("starts no worker while it is not wanted", () => {
    const h = start(false);
    h.ticks(photo(1));
    expect(h.workers).toHaveLength(0);
    expect(onDemandState("depth")).toEqual({ state: "idle" });
    expect(h.demand.attach(shown(1)).tasks.depth).toBeUndefined();
  });

  it("starts when it becomes wanted, sends one frame, and nothing after the result", () => {
    const h = start(false);
    h.ticks(photo(1), 3);
    h.flip(true);
    expect(h.workers).toHaveLength(1);
    expect(onDemandState("depth")).toEqual({ state: "loading" });
    // Not ready yet: no frame.
    h.ticks(photo(1));
    expect(h.frames(h.workers[0])).toHaveLength(0);
    h.workers[0].reply({ type: "ready", delegate: "CPU" });
    expect(onDemandState("depth")).toEqual({ state: "mapping" });
    h.ticks(photo(1));
    expect(h.frames(h.workers[0])).toHaveLength(1);
    h.workers[0].reply({ type: "result", result: depthResult(1) });
    expect(onDemandState("depth")).toEqual({ state: "ready" });
    expect(h.hooks.changed).toHaveBeenCalled();
    h.ticks(photo(1));
    expect(h.frames(h.workers[0])).toHaveLength(1);
    // Not wanted any more: the worker goes, and so does its result.
    h.flip(false);
    expect(h.workers[0].terminated).toBe(true);
    expect(onDemandState("depth")).toEqual({ state: "idle" });
    expect(h.demand.attach(shown(1)).tasks.depth).toBeUndefined();
  });

  it("acts only when the answer flips, however often it is told to look again", () => {
    const h = start(true);
    h.ticks(photo(1), 2);
    for (let i = 0; i < 50; i++) h.flip(true);
    expect(h.workers).toHaveLength(1);
  });

  it("sends nothing while paused, and never a frame of a video", () => {
    const h = start(true);
    h.ticks(photo(1), 1);
    h.workers[0].reply({ type: "ready", delegate: "CPU" });
    for (let i = 0; i < 20; i++) h.demand.tick(1e6 + i * 100, photo(1), true);
    const video = {
      ...photo(1),
      element: { videoWidth: 800, videoHeight: 600 },
    } as unknown as Source;
    h.ticks(video);
    expect(h.frames(h.workers[0])).toHaveLength(0);
  });

  it("drops the map of the old photo and makes one of the new one", () => {
    const h = start(true);
    h.ticks(photo(1), 1);
    h.workers[0].reply({ type: "ready", delegate: "CPU" });
    h.ticks(photo(1));
    h.workers[0].reply({ type: "result", result: depthResult(1) });
    expect(h.demand.attach(shown(1)).tasks.depth?.generation).toBe(1);
    h.ticks(photo(2));
    // The old map belongs to no result of the new photo.
    expect(h.demand.attach(shown(2)).tasks.depth).toBeUndefined();
    expect(onDemandState("depth")).toEqual({ state: "mapping" });
    const frames = h.frames(h.workers[0]);
    expect(frames).toHaveLength(2);
    expect(frames[1].generation).toBe(2);
    // A late answer for the old photo is not kept.
    h.workers[0].reply({ type: "result", result: depthResult(1) });
    expect(h.demand.attach(shown(2)).tasks.depth).toBeUndefined();
    h.workers[0].reply({ type: "result", result: depthResult(2) });
    expect(h.demand.attach(shown(2)).tasks.depth?.generation).toBe(2);
    expect(h.workers).toHaveLength(1);
  });

  it("keeps a failure to itself: the page's own task is not touched", () => {
    const h = start(true),
      seen: string[] = [],
      off = onOnDemandState(() => seen.push(onDemandState("depth").state));
    h.ticks(photo(1), 1);
    h.workers[0].reply({
      type: "error",
      error: "Vision model failed: no such file",
    });
    off();
    expect(onDemandState("depth")).toEqual({
      state: "failed",
      note: "Vision model failed: no such file",
    });
    expect(seen).toContain("failed");
    expect(h.hooks.unavailable).not.toHaveBeenCalled();
    const result = shown(1);
    expect(h.demand.attach(result)).toBe(result);
    h.ticks(photo(1));
    expect(h.workers).toHaveLength(1);
  });

  it("attaches the map without touching the result's latency or its own task", () => {
    const h = start(true);
    h.ticks(photo(1), 1);
    h.workers[0].reply({ type: "ready", delegate: "CPU" });
    h.ticks(photo(1), 2);
    h.workers[0].reply({ type: "result", result: depthResult(1, 900) });
    const result = shown(1),
      attached = h.demand.attach(result);
    expect(attached.tasks.depth?.latency).toBe(900);
    expect(attached.latency).toBe(80);
    expect(attached.time).toBe(40);
    expect(attached.tasks.object).toBe(result.tasks.object);
    // The result it was handed is not edited.
    expect(result.tasks.depth).toBeUndefined();
  });

  it("gives everything back when the mode goes", () => {
    const h = start(true);
    h.ticks(photo(1), 1);
    h.demand.dispose();
    expect(h.workers[0].terminated).toBe(true);
    expect(h.listeners.size).toBe(0);
    expect(onDemandState("depth")).toEqual({ state: "idle" });
  });
});
