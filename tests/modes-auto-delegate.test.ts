/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WebglProbe } from "../src/vision/webgl-probe";

// The page's one WebGL probe, replaced by whatever the test says it saw.
let probe: WebglProbe | null = null;
vi.mock("../src/vision/webgl-probe", () => ({
  probeWebgl: () => probe,
  webgl2Missing: () => probe?.webgl2 === false,
}));

import {
  autoDelegate,
  chooseDelegate,
  requestedDelegate,
} from "../src/vision/delegate";
import { createTaskRunner } from "../src/vision/task-runner";
import type { LiveOptions, TaskSpec } from "../src/vision/types";

const M3 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)";
const auto: TaskSpec = {
  kind: "hand",
  model: "hand.task",
  options: { numHands: 2 },
  delegate: "AUTO",
};

describe("the automatic delegate", () => {
  beforeEach(() => {
    probe = null;
    chooseDelegate("hand", null);
  });
  it("is GPU only for a named hardware renderer", () => {
    probe = { webgl2: true, renderer: M3 };
    expect(autoDelegate()).toBe("GPU");
  });
  it("is CPU for software renderers, hidden names, no WebGL2 and no probe", () => {
    for (const renderer of [
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)",
      "llvmpipe (LLVM 15.0.7, 256 bits)",
      "softpipe",
      "Microsoft Basic Render Driver",
      "",
    ]) {
      probe = { webgl2: true, renderer };
      expect(autoDelegate(), renderer).toBe("CPU");
    }
    probe = { webgl2: false, renderer: M3 };
    expect(autoDelegate()).toBe("CPU");
    probe = null;
    expect(autoDelegate()).toBe("CPU");
  });
  it("is settled by requestedDelegate, and the lab's choice wins over it", () => {
    probe = { webgl2: true, renderer: M3 };
    expect(requestedDelegate(auto)).toBe("GPU");
    chooseDelegate("hand", "CPU");
    expect(requestedDelegate(auto)).toBe("CPU");
    chooseDelegate("hand", null);
    expect(requestedDelegate({ ...auto, delegate: "CPU" })).toBe("CPU");
  });
});

type Fake = {
  posted: Record<string, unknown>[];
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  terminated: boolean;
  postMessage(m: unknown): void;
  terminate(): void;
  reply(d: unknown): void;
};
function harness(spec: TaskSpec) {
  const workers: Fake[] = [],
    events = {
      onReady: vi.fn(),
      onRestart: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
    };
  const runner = createTaskRunner(spec, "http://x/", events, () => {
    const fake: Fake = {
      posted: [],
      onmessage: null,
      onerror: null,
      terminated: false,
      postMessage(m) {
        this.posted.push(m as Record<string, unknown>);
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
  return { workers, runner };
}
const taskOf = (w: Fake) => w.posted[0].task as TaskSpec;

describe("a runner for an AUTO task", () => {
  beforeEach(() => {
    probe = null;
    chooseDelegate("hand", null);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  it("starts on GPU with a hardware renderer and on CPU on a software one", () => {
    probe = { webgl2: true, renderer: M3 };
    const gpu = harness(auto);
    expect(taskOf(gpu.workers[0]).delegate).toBe("GPU");
    expect(gpu.runner.delegate()).toBe("GPU");
    gpu.runner.dispose();
    probe = { webgl2: true, renderer: "SwiftShader" };
    const cpu = harness(auto);
    expect(taskOf(cpu.workers[0]).delegate).toBe("CPU");
    expect(cpu.runner.delegate()).toBe("CPU");
    cpu.runner.dispose();
  });
  it("still falls back to CPU when the automatic GPU never produces a frame", () => {
    probe = { webgl2: true, renderer: M3 };
    const { workers, runner } = harness(auto);
    workers[0].reply({ type: "error", error: "Vision model failed: no GPU" });
    expect(workers).toHaveLength(2);
    expect(taskOf(workers[1]).delegate).toBe("CPU");
    expect(runner.delegate()).toBe("CPU");
    runner.dispose();
  });
});

describe("live options", () => {
  const make = () => {
    let value = 1;
    const listeners = new Set<() => void>(),
      live: LiveOptions = {
        current: () => ({ numPoses: value }),
        subscribe: (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
      };
    return {
      live,
      listeners,
      set(next: number) {
        value = next;
        listeners.forEach((l) => l());
      },
    };
  };
  const spec = (live: LiveOptions): TaskSpec => ({
    kind: "pose",
    model: "p.task",
    options: { numPoses: 9, minPoseDetectionConfidence: 0.4 },
    live,
    delegate: "CPU",
  });
  it("folds the current values into the options and posts nothing uncloneable", () => {
    const { live } = make(),
      { workers, runner } = harness(spec(live)),
      task = taskOf(workers[0]);
    expect(task.options).toEqual({
      numPoses: 1,
      minPoseDetectionConfidence: 0.4,
    });
    expect("live" in task).toBe(false);
    expect(() => structuredClone(workers[0].posted[0])).not.toThrow();
    runner.dispose();
  });
  it("tells the running worker when a value changes, and stops after dispose", () => {
    const { live, set, listeners } = make(),
      { workers, runner } = harness(spec(live));
    workers[0].reply({ type: "ready", delegate: "CPU" });
    set(3);
    expect(workers[0].posted.at(-1)).toEqual({
      type: "options",
      options: { numPoses: 3 },
    });
    expect(workers).toHaveLength(1);
    runner.dispose();
    expect(listeners.size).toBe(0);
    const before = workers[0].posted.length;
    set(2);
    expect(workers[0].posted).toHaveLength(before);
  });
});
