/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebglProbe } from "../src/vision/webgl-probe";

// The page's one WebGL probe, replaced by whatever the test says it saw.
let probe: WebglProbe | null = null;
vi.mock("../src/vision/webgl-probe", () => ({
  probeWebgl: () => probe,
  webgl2Missing: () => probe?.webgl2 === false,
}));

import { getMode, tasksOf } from "../src/modes";
import { taskStatus } from "../src/telemetry/task-status";
import { chooseDelegate } from "../src/vision/delegate";
import {
  GUARD_RESULTS,
  SLOW_MS,
  gpuModelRefusal,
  largerOnGpu,
  medianOf,
  modelChoiceWatchers,
  resetModelChoice,
  setLargerOnGpu,
} from "../src/vision/model-choice";
import { modelOf, setPrecision } from "../src/vision/settings";
import { createTaskRunner } from "../src/vision/task-runner";
import type { TaskResult, TaskSpec } from "../src/vision/types";

const M3 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
  SOFTWARE = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader)",
  SMALL = "efficientdet_lite0.tflite",
  LARGE = "efficientdet_lite2.tflite",
  spec = tasksOf(getMode("objects"))[0];

type Fake = {
  posted: { type: string; task?: TaskSpec }[];
  terminated: boolean;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
  reply(d: unknown): void;
};
function harness(task: TaskSpec = spec) {
  const workers: Fake[] = [],
    events = {
      onReady: vi.fn(),
      onRestart: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
    };
  const runner = createTaskRunner(task, "http://x/", events, () => {
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
const init = (w: Fake) => w.posted[0].task!;
const result = (latency: number, extra?: Record<string, unknown>) => ({
  type: "result",
  result: {
    kind: "object",
    generation: 1,
    time: 1,
    latency,
    detections: [],
    landmarks: [],
    handedness: [],
    extra,
  } as unknown as TaskResult,
});
/** A worker that loads and answers `count` times at `latency` ms. */
const work = (w: Fake, count: number, latency: number) => {
  w.reply({ type: "ready", delegate: init(w).delegate });
  for (let i = 0; i < count; i++) w.reply(result(latency));
};

beforeEach(() => {
  probe = { webgl2: true, renderer: M3 };
  resetModelChoice();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  // Forgets the remembered GPU failure and the Lab choice.
  chooseDelegate("object", "GPU");
  chooseDelegate("object", null);
  setPrecision("fast");
  resetModelChoice();
  vi.restoreAllMocks();
});

describe("which model Objects runs", () => {
  it("names the larger model for a GPU and states both sizes", () => {
    expect(spec).toMatchObject({
      model: SMALL,
      gpuModel: LARGE,
      preciseModel: LARGE,
    });
    expect(Object.keys(spec.sizes!).sort()).toEqual([SMALL, LARGE]);
  });
  it("is the larger one on GPU and the standard one on CPU", () => {
    expect(modelOf(spec, "fast", "GPU")).toBe(LARGE);
    expect(modelOf(spec, "fast", "CPU")).toBe(SMALL);
    // Precise is the person's own choice: the larger model everywhere.
    expect(modelOf(spec, "precise", "CPU")).toBe(LARGE);
    expect(modelOf(spec, "precise", "GPU")).toBe(LARGE);
  });
  it("is the standard one on GPU once the switch is off", () => {
    setLargerOnGpu(false);
    expect(largerOnGpu()).toBe(false);
    expect(modelOf(spec, "fast", "GPU")).toBe(SMALL);
  });
  it("never changes a task that names no larger model", () => {
    const pose = { kind: "pose" as const, model: "lite.task" };
    expect(modelOf(pose, "fast", "GPU")).toBe("lite.task");
  });
  it("takes the middle latency, whatever the order", () => {
    expect(medianOf([5, 1, 9])).toBe(5);
    expect(medianOf([4, 1, 9, 6])).toBe(5);
  });
});

describe("the task runner and the larger model", () => {
  it("loads it on a real GPU, and the Lab's lookup names the same file", () => {
    const { workers, runner } = harness();
    expect(init(workers[0])).toMatchObject({ model: LARGE, delegate: "GPU" });
    expect(runner.model()).toBe(LARGE);
    expect(modelOf(spec)).toBe(LARGE);
    expect(taskStatus("object", modelOf(spec))).toMatchObject({
      active: "GPU",
    });
    runner.dispose();
  });
  it("loads the standard model where the GPU is a software renderer", () => {
    probe = { webgl2: true, renderer: SOFTWARE };
    const { workers, runner } = harness();
    expect(init(workers[0])).toMatchObject({ model: SMALL, delegate: "CPU" });
    expect(modelOf(spec)).toBe(SMALL);
    runner.dispose();
  });
  it("drops back to the standard model when the GPU is lost", () => {
    const { workers, runner, events } = harness();
    work(workers[0], 3, 60);
    workers[0].reply({
      type: "error",
      error: "Vision model failed: the GPU context was lost",
    });
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(init(workers[1])).toMatchObject({ model: SMALL, delegate: "CPU" });
    expect(runner.model()).toBe(SMALL);
    expect(modelOf(spec)).toBe(SMALL);
    expect(events.onError).not.toHaveBeenCalled();
    expect(taskStatus("object", SMALL)!.note).toBe(
      "GPU stopped working (the GPU context was lost). Now running on CPU.",
    );
    // Results from the restarted worker carry the file that made them.
    work(workers[1], 1, 80);
    expect(events.onResult.mock.calls.at(-1)![0]).toMatchObject({
      model: SMALL,
      delegate: "CPU",
    });
    runner.dispose();
  });
  it("keeps it where it is quick enough", () => {
    const { workers, runner, events } = harness();
    work(workers[0], GUARD_RESULTS + 10, SLOW_MS);
    expect(workers).toHaveLength(1);
    expect(events.onRestart).not.toHaveBeenCalled();
    expect(gpuModelRefusal("object")).toBeNull();
    // Judged once: a slow spell later does not undo it.
    work(workers[0], GUARD_RESULTS + 10, SLOW_MS * 3);
    expect(workers).toHaveLength(1);
    runner.dispose();
  });
  it("gives it up where it is slow, stays on GPU and says so", () => {
    const { workers, runner, events } = harness();
    work(workers[0], GUARD_RESULTS - 1, 200);
    expect(workers).toHaveLength(1);
    workers[0].reply(result(200));
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(init(workers[1])).toMatchObject({ model: SMALL, delegate: "GPU" });
    expect(events.onRestart).toHaveBeenCalledTimes(1);
    // The result that tipped it was still delivered.
    expect(events.onResult).toHaveBeenCalledTimes(GUARD_RESULTS);
    expect(runner.model()).toBe(SMALL);
    expect(modelOf(spec)).toBe(SMALL);
    expect(taskStatus("object", SMALL)!.note).toBe(
      "The larger model was slow on this device (200 ms a frame). Running the standard model.",
    );
    expect(gpuModelRefusal("object")).toBe("it took 200 ms a frame here");
    // The standard model is not put on trial in its turn.
    work(workers[1], GUARD_RESULTS + 5, 500);
    expect(workers).toHaveLength(2);
    runner.dispose();
    // The next runner on this page does not repeat the trial.
    const again = harness();
    expect(init(again.workers[0]).model).toBe(SMALL);
    again.runner.dispose();
  });
  it("is not fooled by a few slow frames among quick ones", () => {
    const { workers, runner } = harness();
    workers[0].reply({ type: "ready", delegate: "GPU" });
    for (let i = 0; i < GUARD_RESULTS; i++)
      workers[0].reply(result(i % 3 ? 60 : 400));
    expect(workers).toHaveLength(1);
    runner.dispose();
  });
  it("judges the model without the time Finer names add", () => {
    const { workers, runner } = harness();
    workers[0].reply({ type: "ready", delegate: "GPU" });
    for (let i = 0; i < GUARD_RESULTS; i++)
      workers[0].reply(result(200, { finer: { ms: 140 } }));
    expect(workers).toHaveLength(1);
    runner.dispose();
  });
  it("does not judge a model the person chose with Precise", () => {
    setPrecision("precise");
    const { workers, runner } = harness();
    expect(init(workers[0]).model).toBe(LARGE);
    work(workers[0], GUARD_RESULTS + 5, 400);
    expect(workers).toHaveLength(1);
    expect(gpuModelRefusal("object")).toBeNull();
    runner.dispose();
  });
  it("stops judging when Precise is chosen while the trial runs", () => {
    const { workers, runner } = harness();
    work(workers[0], 10, 400);
    // The same file under both settings: nothing is loaded again.
    setPrecision("precise");
    expect(workers).toHaveLength(1);
    work(workers[0], GUARD_RESULTS, 400);
    expect(workers).toHaveLength(1);
    expect(gpuModelRefusal("object")).toBeNull();
    runner.dispose();
  });
  it("follows the switch while running, and switching on tries a refused model again", () => {
    const { workers, runner, events } = harness();
    work(workers[0], 2, 60);
    setLargerOnGpu(false);
    expect(workers).toHaveLength(2);
    expect(init(workers[1])).toMatchObject({ model: SMALL, delegate: "GPU" });
    expect(events.onRestart).toHaveBeenCalledTimes(1);
    setLargerOnGpu(true);
    expect(init(workers[2]).model).toBe(LARGE);
    work(workers[2], GUARD_RESULTS, 300);
    expect(init(workers[3]).model).toBe(SMALL);
    expect(gpuModelRefusal("object")).not.toBeNull();
    // On already, pressed again after off: the refusal is forgotten.
    setLargerOnGpu(false);
    setLargerOnGpu(true);
    expect(gpuModelRefusal("object")).toBeNull();
    expect(init(workers.at(-1)!).model).toBe(LARGE);
    runner.dispose();
  });
  it("runs the standard model when the larger one cannot be fetched", () => {
    const { workers, runner, events } = harness();
    workers[0].reply({
      type: "error",
      error: `Vision model failed: HTTP 404 for http://x/models/${LARGE}`,
    });
    expect(workers).toHaveLength(2);
    // The download failed, not the GPU: the delegate stays.
    expect(init(workers[1])).toMatchObject({ model: SMALL, delegate: "GPU" });
    expect(events.onError).not.toHaveBeenCalled();
    expect(taskStatus("object", SMALL)!.note).toMatch(
      /^The larger model did not load \(.+\)\. Running the standard model\.$/,
    );
    expect(modelOf(spec)).toBe(SMALL);
    runner.dispose();
  });
  it("stops listening to the switch when it is disposed", () => {
    const before = modelChoiceWatchers(),
      { workers, runner } = harness();
    expect(modelChoiceWatchers()).toBe(before + 1);
    runner.dispose();
    expect(modelChoiceWatchers()).toBe(before);
    setLargerOnGpu(false);
    expect(workers).toHaveLength(1);
  });
});
