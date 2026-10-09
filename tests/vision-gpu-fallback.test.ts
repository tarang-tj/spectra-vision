/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
  gpuFailure,
  softwareRendererReason,
} from "../src/vision/delegate";
import { createTaskRunner } from "../src/vision/task-runner";
import { taskStatus } from "../src/telemetry/task-status";
import type { TaskResult, TaskSpec } from "../src/vision/types";

const M3 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)";
const auto: TaskSpec = {
  kind: "hand",
  model: "hand.task",
  options: {},
  delegate: "AUTO",
};

type Fake = {
  posted: { task?: TaskSpec }[];
  terminated: boolean;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
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
      terminated: false,
      onmessage: null,
      onerror: null,
      postMessage(m) {
        this.posted.push(m as Fake["posted"][number]);
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
  return { workers, events, runner };
}
const sent = (w: Fake) => w.posted[0].task?.delegate;
const output = { kind: "hand", time: 5, latency: 3, detections: [] };
const work = (w: Fake) => {
  w.reply({ type: "ready", delegate: "GPU" });
  w.reply({ type: "result", result: { ...output } as unknown as TaskResult });
};
const status = () => taskStatus("hand", "hand.task")!;

beforeEach(() => {
  probe = { webgl2: true, renderer: M3 };
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  // Forgets the remembered GPU failure and the Lab choice.
  chooseDelegate("hand", "GPU");
  chooseDelegate("hand", null);
  vi.restoreAllMocks();
});

describe("a GPU task that fails after producing results", () => {
  it("restarts once on CPU with a truthful note, then a CPU failure is real", () => {
    const { workers, events, runner } = harness(auto);
    work(workers[0]);
    expect(events.onResult).toHaveBeenCalledTimes(1);
    workers[0].reply({ type: "error", error: "Vision model failed: lost" });
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(sent(workers[1])).toBe("CPU");
    expect(events.onRestart).toHaveBeenCalledTimes(1);
    expect(events.onError).not.toHaveBeenCalled();
    expect(runner.delegate()).toBe("CPU");
    expect(status()).toMatchObject({
      requested: "GPU",
      active: "CPU",
      state: "loading",
      note: "GPU stopped working (lost). Now running on CPU.",
    });
    workers[1].reply({ type: "ready", delegate: "CPU" });
    workers[1].reply({
      type: "result",
      result: { ...output } as unknown as TaskResult,
    });
    expect(status()).toMatchObject({ state: "ready", active: "CPU" });
    expect(status().firstResultMs).not.toBeNull();
    // The CPU run breaks too: a real error, no third worker, no way back to GPU.
    workers[1].reply({ type: "error", error: "Vision model failed: boom" });
    expect(workers).toHaveLength(2);
    expect(events.onError).toHaveBeenCalledWith("Vision model failed: boom");
    expect(runner.delegate()).toBe("CPU");
    expect(status().state).toBe("failed");
    runner.dispose();
  });
});

describe("the GPU failure memory", () => {
  const failAfterWork = () => {
    const first = harness(auto);
    work(first.workers[0]);
    first.workers[0].reply({
      type: "error",
      error: "Vision model failed: lost",
    });
    return first;
  };
  it("starts the next AUTO runner of that kind on CPU, and only that kind", () => {
    const first = failAfterWork();
    expect(gpuFailure("hand")).toBe("lost");
    first.runner.dispose();
    const next = harness(auto);
    expect(sent(next.workers[0])).toBe("CPU");
    expect(next.runner.delegate()).toBe("CPU");
    expect(status()).toMatchObject({ requested: "GPU", active: "CPU" });
    expect(status().note).toMatch(
      /GPU failed earlier on this page \(lost\)\. Running on CPU\./,
    );
    next.runner.dispose();
    const other = harness({ ...auto, kind: "pose", model: "pose.task" });
    expect(sent(other.workers[0])).toBe("GPU");
    other.runner.dispose();
  });
  it("is cleared by an explicit GPU choice in the Lab, which tries GPU again", () => {
    const first = failAfterWork();
    first.runner.dispose();
    const next = harness(auto);
    expect(sent(next.workers[0])).toBe("CPU");
    chooseDelegate("hand", "GPU");
    expect(gpuFailure("hand")).toBeNull();
    expect(next.workers).toHaveLength(2);
    expect(sent(next.workers[1])).toBe("GPU");
    expect(next.runner.delegate()).toBe("GPU");
    expect(status()).toMatchObject({ active: "GPU", note: "" });
    next.runner.dispose();
  });
  it("lets a runner that failed over click GPU again, and falls back only once more", () => {
    const { workers, runner, events } = failAfterWork();
    expect(sent(workers[1])).toBe("CPU");
    // GPU is already the chosen request here: choosing it again still retries.
    chooseDelegate("hand", "GPU");
    chooseDelegate("hand", "GPU");
    expect(workers).toHaveLength(3);
    expect(sent(workers[2])).toBe("GPU");
    work(workers[2]);
    workers[2].reply({ type: "error", error: "Vision model failed: again" });
    expect(workers).toHaveLength(4);
    expect(sent(workers[3])).toBe("CPU");
    expect(status().note).toBe(
      "GPU stopped working (again). Now running on CPU.",
    );
    expect(events.onError).not.toHaveBeenCalled();
    runner.dispose();
  });
});

describe("software renderer names", () => {
  it.each([
    "ANGLE (Mesa, llvmpipe (LLVM 15.0.7, 256 bits), OpenGL 4.5)",
    "ANGLE (Mesa, Vulkan 1.3 (lavapipe (LLVM 15.0.7)), Mesa 23.2)",
    "ANGLE (Microsoft, Microsoft Direct3D11 vs_5_0 ps_5_0, D3D11-WARP)",
    "Microsoft WARP",
    "Mesa OffScreen",
    "Generic Renderer",
  ])("%s is refused by the Lab and resolved to CPU by AUTO", (renderer) => {
    expect(softwareRendererReason(renderer)).toMatch(/in software/);
    probe = { webgl2: true, renderer };
    expect(autoDelegate()).toBe("CPU");
  });
  it("still lets a hardware renderer use GPU", () => {
    expect(softwareRendererReason(M3)).toBeNull();
    expect(autoDelegate()).toBe("GPU");
  });
});
