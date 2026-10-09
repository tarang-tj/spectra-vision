import { describe, it, expect, vi, afterEach } from "vitest";
import { mergeResults } from "../src/vision/merge";
import { chooseDelegate, fallbackDelegate } from "../src/vision/delegate";
import { createTaskRunner } from "../src/vision/task-runner";
import { telemetry } from "../src/telemetry/bus";
import type { TaskKind, TaskResult, TaskSpec } from "../src/vision/types";

const result = (
  kind: TaskKind,
  time: number,
  latency: number,
  generation = 1,
): TaskResult => ({
  kind,
  generation,
  time,
  latency,
  delegate: "CPU",
  detections:
    kind === "object"
      ? [{ label: "person", score: 0.9, box: { x: 0, y: 0, w: 1, h: 1 } }]
      : [],
  landmarks: kind === "object" ? [] : [[{ x: time, y: 0 }]],
  handedness: kind === "hand" ? ["Left"] : [],
});

describe("merging task results into one vision result", () => {
  it("leaves a single-task mode exactly as the task reported it", () => {
    const hand = result("hand", 120, 9);
    const merged = mergeResults("hands", ["hand"], {}, hand);
    expect(merged).toEqual({
      mode: "hands",
      generation: 1,
      time: 120,
      latency: 9,
      detections: [],
      landmarks: hand.landmarks,
      handedness: ["Left"],
      tasks: { hand },
    });
    expect(merged.landmarks).toBe(hand.landmarks);
  });
  it("keeps the latest result of every task and reads the flat fields from the primary", () => {
    const kinds: TaskKind[] = ["pose", "hand"];
    const pose = result("pose", 100, 20),
      hand = result("hand", 104, 8);
    const first = mergeResults("fusion", kinds, {}, pose);
    expect(Object.keys(first.tasks)).toEqual(["pose"]);
    const both = mergeResults("fusion", kinds, first.tasks, hand);
    expect(both.tasks.pose).toBe(pose);
    expect(both.tasks.hand).toBe(hand);
    // Primary (pose) owns time and landmarks; latency is the slowest task.
    expect(both.time).toBe(100);
    expect(both.landmarks).toBe(pose.landmarks);
    expect(both.handedness).toEqual([]);
    expect(both.latency).toBe(20);
    const next = mergeResults(
      "fusion",
      kinds,
      both.tasks,
      result("pose", 170, 5),
    );
    expect(next.time).toBe(170);
    expect(next.tasks.hand).toBe(hand);
    expect(next.latency).toBe(8);
  });
  it("uses the reporting task until the primary has a result", () => {
    const hand = result("hand", 50, 7);
    const merged = mergeResults("fusion", ["pose", "hand"], {}, hand);
    expect(merged.time).toBe(50);
    expect(merged.handedness).toEqual(["Left"]);
  });
  it("never mixes in results from a previous source", () => {
    const old = mergeResults(
      "fusion",
      ["pose", "hand"],
      {},
      result("pose", 10, 5, 1),
    );
    const fresh = mergeResults(
      "fusion",
      ["pose", "hand"],
      old.tasks,
      result("hand", 20, 6, 2),
    );
    expect(fresh.generation).toBe(2);
    expect(fresh.tasks.pose).toBeUndefined();
    expect(Object.keys(fresh.tasks)).toEqual(["hand"]);
  });
});

describe("GPU to CPU fallback", () => {
  // Changed from "only when GPU never produced a result": a GPU task that
  // worked and then failed (lost context, driver reset) now also retries on
  // CPU. The produced argument is gone; CPU still never retries.
  it("retries a failed GPU task on CPU, with or without earlier results", () => {
    expect(fallbackDelegate("GPU")).toBe("CPU");
    expect(fallbackDelegate("CPU")).toBeNull();
  });
  afterEach(() => {
    // Forget the GPU failure these tests record for "pose".
    chooseDelegate("pose", "GPU");
    chooseDelegate("pose", null);
  });

  // A stand-in for the Worker object, so the runner's real restart path runs.
  type Fake = {
    url: string;
    posted: { type: string; task?: TaskSpec }[];
    terminated: boolean;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage(message: unknown): void;
    terminate(): void;
    reply(data: unknown): void;
  };
  const harness = (spec: TaskSpec) => {
    const workers: Fake[] = [],
      events = { onReady: vi.fn(), onResult: vi.fn(), onError: vi.fn() };
    const runner = createTaskRunner(spec, "http://x/", events, (url) => {
      const fake: Fake = {
        url,
        posted: [],
        terminated: false,
        onmessage: null,
        onerror: null,
        postMessage(message) {
          this.posted.push(message as Fake["posted"][number]);
        },
        terminate() {
          this.terminated = true;
        },
        reply(data) {
          this.onmessage?.({ data } as MessageEvent);
        },
      };
      workers.push(fake);
      return fake;
    });
    return { workers, events, runner };
  };
  const gpu: TaskSpec = {
    kind: "pose",
    model: "pose.task",
    options: { numPoses: 1 },
    delegate: "GPU",
  };

  it("restarts a failed GPU task on CPU and reports the delegate in use", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const loads: unknown[] = [];
    const off = telemetry.on("model", (event) => loads.push(event));
    const { workers, events, runner } = harness(gpu);
    expect(workers).toHaveLength(1);
    expect(workers[0].url).toBe("http://x/vision-worker.js");
    expect(workers[0].posted[0].task).toEqual(gpu);
    workers[0].reply({ type: "error", error: "Vision model failed: no GPU" });
    // The broken worker is gone and a second one was asked for CPU.
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].posted[0].task).toEqual({ ...gpu, delegate: "CPU" });
    expect(events.onError).not.toHaveBeenCalled();
    expect(runner.ready()).toBe(false);
    workers[1].reply({ type: "ready", delegate: "CPU" });
    expect(runner.ready()).toBe(true);
    expect(runner.delegate()).toBe("CPU");
    expect(events.onReady).toHaveBeenCalledTimes(1);
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({
      kind: "pose",
      requested: "GPU",
      delegate: "CPU",
    });
    workers[1].reply({ type: "result", result: result("pose", 5, 3) });
    expect(events.onResult.mock.calls[0][0].delegate).toBe("CPU");
    // A CPU failure has nowhere left to fall back to: it is a real error.
    workers[1].reply({ type: "error", error: "Vision model failed: boom" });
    expect(workers).toHaveLength(2);
    expect(events.onError).toHaveBeenCalledWith("Vision model failed: boom");
    off();
    warn.mockRestore();
    runner.dispose();
    expect(workers[1].terminated).toBe(true);
  });
  // Changed from "does not fall back once GPU has produced a result": that
  // rule is the gap this fix closes. A working GPU task that breaks now
  // restarts once on CPU; a CPU task's failure is still a real error.
  it("falls back once when a working GPU task breaks, but not for a CPU task", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const working = harness(gpu);
    working.workers[0].reply({ type: "ready", delegate: "GPU" });
    working.workers[0].reply({ type: "result", result: result("pose", 5, 3) });
    expect(working.events.onResult.mock.calls[0][0].delegate).toBe("GPU");
    working.workers[0].reply({ type: "error", error: "lost" });
    expect(working.workers).toHaveLength(2);
    expect(working.workers[1].posted[0].task?.delegate).toBe("CPU");
    expect(working.events.onError).not.toHaveBeenCalled();
    working.runner.dispose();
    const cpu = harness({ ...gpu, delegate: "CPU" });
    cpu.workers[0].reply({ type: "error", error: "bad model" });
    expect(cpu.workers).toHaveLength(1);
    expect(cpu.events.onError).toHaveBeenCalledWith("bad model");
  });
  it("keeps one frame in flight and paces requests", () => {
    const { workers, runner } = harness({ ...gpu, delegate: "CPU" });
    expect(runner.wants(1000)).toBe(false);
    workers[0].reply({ type: "ready", delegate: "CPU" });
    expect(runner.wants(1000)).toBe(true);
    runner.claim(1000);
    expect(runner.wants(2000)).toBe(false);
    workers[0].reply({ type: "result", result: result("pose", 5, 3) });
    expect(runner.wants(1030)).toBe(false);
    expect(runner.wants(1065)).toBe(true);
  });
});
