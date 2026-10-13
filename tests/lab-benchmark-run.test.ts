/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The benchmark protocol run against real task runners with stand-in workers:
// which model's record a row waits on, and which model file each row times.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebglProbe } from "../src/vision/webgl-probe";

// The page's one WebGL probe, replaced by whatever the test says it saw.
let probe: WebglProbe | null = null;
vi.mock("../src/vision/webgl-probe", () => ({
  probeWebgl: () => probe,
  webgl2Missing: () => probe?.webgl2 === false,
}));

import { getMode, tasksOf } from "../src/modes";
import type { ModeDef } from "../src/modes";
import { runBenchmark } from "../src/panels/lab/benchmark";
import type { BenchHost } from "../src/panels/lab/benchmark";
import { taskStatus } from "../src/telemetry/task-status";
import { chooseDelegate } from "../src/vision/delegate";
import { resetSharper } from "../src/vision/detector/sharper";
import {
  resetModelChoice,
  standardModelHeld,
} from "../src/vision/model-choice";
import { setPrecision } from "../src/vision/settings";
import { createTaskRunner } from "../src/vision/task-runner";
import type { Delegate, TaskResult, TaskSpec } from "../src/vision/types";

const M3 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
  SOFTWARE = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader)",
  SMALL = "efficientdet_lite0.tflite",
  LARGE = "efficientdet_lite2.tflite",
  objects = getMode("objects"),
  body = getMode("body");

type Fake = {
  posted: { type: string; task?: TaskSpec }[];
  terminated: boolean;
  answered: boolean;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
  reply(d: unknown): void;
};
/** One mode's runner on stand-in workers, as the page would hold it. */
function stage(mode: ModeDef) {
  const spec = tasksOf(mode)[0],
    workers: Fake[] = [],
    events = { onReady: vi.fn(), onResult: vi.fn(), onError: vi.fn() };
  const runner = createTaskRunner(spec, "http://x/", events, () => {
    const fake: Fake = {
      posted: [],
      terminated: false,
      answered: false,
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
  const result = {
    type: "result",
    result: {
      kind: spec.kind,
      generation: 1,
      time: 1,
      latency: 5,
      detections: [],
      landmarks: [],
      handedness: [],
    } as unknown as TaskResult,
  };
  /** The live worker loads, then answers once per call. */
  const answer = () => {
    const w = workers.find((worker) => !worker.terminated);
    if (!w) return;
    if (w.answered) return w.reply(result);
    w.answered = true;
    w.reply({ type: "ready", delegate: w.posted[0].task!.delegate });
  };
  const host: BenchHost = {
    mode: () => mode,
    setMode: () => {},
    paused: () => false,
    source: () => null,
  };
  return { spec, workers, runner, answer, host };
}
const plan = (mode: ModeDef, delegates: Delegate[]) => ({
  modes: [mode],
  delegates,
  measureMs: 200,
  warmupMs: 100,
});

beforeEach(() => {
  probe = { webgl2: true, renderer: SOFTWARE };
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "performance",
    ],
  });
  vi.stubGlobal("document", {
    hidden: false,
    addEventListener() {},
    removeEventListener() {},
  });
  resetModelChoice();
  resetSharper();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  for (const kind of ["object", "pose"] as const) {
    chooseDelegate(kind, "GPU");
    chooseDelegate(kind, null);
  }
  setPrecision("fast");
  resetModelChoice();
  resetSharper();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("a benchmark row waits on the model that is running", () => {
  it("finishes a row under Precise, where the task runs its Precise model", async () => {
    setPrecision("precise");
    const { spec, runner, answer, host } = stage(body);
    expect(runner.model()).toBe(spec.preciseModel);
    const pump = setInterval(answer, 20);
    const run = runBenchmark(
      plan(body, ["CPU"]),
      host,
      new AbortController().signal,
      () => {},
    );
    // Longer than the 60 s the protocol waits for a model to load.
    await vi.advanceTimersByTimeAsync(70_000);
    clearInterval(pump);
    const rows = await run;
    runner.dispose();
    expect(rows).toHaveLength(1);
    expect(rows[0].note).toBe("");
    expect(rows[0].status).toBe("ok");
    expect(rows[0].tasks[0].model).toBe(spec.preciseModel);
    expect(rows[0].tasks[0].samples).toBeGreaterThan(0);
  });
  it("reports the running model's own load, not an older record of the standard model", async () => {
    const { workers, runner, answer, host } = stage(objects);
    // Fast on CPU: the standard model loads in 100 ms and goes on record.
    await vi.advanceTimersByTimeAsync(100);
    answer();
    expect(taskStatus("object", SMALL)).toMatchObject({
      state: "ready",
      requested: "CPU",
      loadMs: 100,
    });
    // Precise: the larger model replaces it and takes 300 ms to load.
    setPrecision("precise");
    expect(workers).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(300);
    answer();
    expect(taskStatus("object", LARGE)!.loadMs).toBe(300);
    const pump = setInterval(answer, 20);
    const run = runBenchmark(
      plan(objects, ["CPU"]),
      host,
      new AbortController().signal,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(5_000);
    clearInterval(pump);
    const [row] = await run;
    runner.dispose();
    expect(row.status).toBe("ok");
    expect(row.tasks[0]).toMatchObject({ model: LARGE, loadMs: 300 });
  });
});

describe("a benchmark times one model file per task on every delegate", () => {
  it("names the standard model on the CPU row and the GPU row, and holds it for the run", async () => {
    // A real GPU: left alone, Objects runs its larger model there.
    probe = { webgl2: true, renderer: M3 };
    const { workers, runner, answer, host } = stage(objects);
    expect(runner.model()).toBe(LARGE);
    const pump = setInterval(answer, 20),
      said: string[] = [],
      held: boolean[] = [];
    const run = runBenchmark(
      plan(objects, ["CPU", "GPU"]),
      host,
      new AbortController().signal,
      (text) => {
        said.push(text);
        held.push(standardModelHeld());
      },
    );
    // Long enough for a row that never loads to give up, so it is reported.
    await vi.advanceTimersByTimeAsync(70_000);
    clearInterval(pump);
    const rows = await run;
    expect(rows.map((row) => [row.delegateRequested, row.status])).toEqual([
      ["CPU", "ok"],
      ["GPU", "ok"],
    ]);
    expect(rows.map((row) => row.tasks[0].model)).toEqual([SMALL, SMALL]);
    expect(rows.map((row) => row.tasks[0].delegateActive)).toEqual([
      "CPU",
      "GPU",
    ]);
    expect(said).toContain("Objects on GPU: measuring 0.2 s");
    expect(held.every(Boolean)).toBe(true);
    // No worker ran the larger model between the first row and the last.
    const files = workers.map((w) => w.posted[0].task!.model);
    expect(files.slice(1, -1)).not.toContain(LARGE);
    // Afterwards the hold is gone and the task is back on what it ran before.
    expect(standardModelHeld()).toBe(false);
    expect(runner.model()).toBe(LARGE);
    runner.dispose();
  });
  it("lets the hold go when the run is stopped part way", async () => {
    probe = { webgl2: true, renderer: M3 };
    const { runner, answer, host } = stage(objects),
      stop = new AbortController(),
      pump = setInterval(answer, 20);
    const run = runBenchmark(
      plan(objects, ["CPU", "GPU"]),
      host,
      stop.signal,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(150);
    expect(standardModelHeld()).toBe(true);
    stop.abort();
    await vi.advanceTimersByTimeAsync(50);
    clearInterval(pump);
    expect(await run).toEqual([]);
    expect(standardModelHeld()).toBe(false);
    expect(runner.model()).toBe(LARGE);
    runner.dispose();
  });
  it("lets the hold go when the run ends on an error", async () => {
    probe = { webgl2: true, renderer: M3 };
    const { runner, host } = stage(objects);
    let asked = 0;
    // The first read is the mode to come back to; the second is in the row.
    host.mode = () => {
      if (++asked === 2) throw new Error("the stage went away");
      return objects;
    };
    const failed = expect(
      runBenchmark(
        plan(objects, ["CPU"]),
        host,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow("the stage went away");
    await vi.advanceTimersByTimeAsync(200);
    await failed;
    expect(standardModelHeld()).toBe(false);
    runner.dispose();
  });
});
