import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  GPU_FIRST_RESULT_LIMIT_MS,
  GPU_READY_LIMIT_MS,
  chooseDelegate,
  chosenDelegate,
  delegateWatchers,
  gpuStartTimeout,
  requestedDelegate,
} from "../src/vision/delegate";
import { createTaskRunner } from "../src/vision/task-runner";
import { taskStatus } from "../src/telemetry/task-status";
import { telemetry } from "../src/telemetry/bus";
import type { TaskSpec } from "../src/vision/types";

describe("time-bounded GPU start: the decision", () => {
  const base = {
    active: "GPU" as const,
    ready: false,
    produced: false,
    sinceStart: 0,
    sinceFirstFrame: null,
  };
  it("waits while GPU is still inside its load bound", () => {
    expect(gpuStartTimeout(base)).toBeNull();
    expect(
      gpuStartTimeout({ ...base, sinceStart: GPU_READY_LIMIT_MS - 1 }),
    ).toBeNull();
  });
  it("gives up on a GPU load that passes the bound", () => {
    expect(
      gpuStartTimeout({ ...base, sinceStart: GPU_READY_LIMIT_MS }),
    ).toMatch(/did not load within 8 s/);
  });
  it("does not time out a loaded GPU task that has not been sent a frame", () => {
    expect(
      gpuStartTimeout({ ...base, ready: true, sinceStart: 600_000 }),
    ).toBeNull();
  });
  it("gives up when the first GPU frame never comes back", () => {
    const sent = { ...base, ready: true, sinceStart: 9000 };
    expect(
      gpuStartTimeout({
        ...sent,
        sinceFirstFrame: GPU_FIRST_RESULT_LIMIT_MS - 1,
      }),
    ).toBeNull();
    expect(
      gpuStartTimeout({ ...sent, sinceFirstFrame: GPU_FIRST_RESULT_LIMIT_MS }),
    ).toMatch(/no result within 5 s/);
  });
  it("never times out CPU or a GPU task that already produced a result", () => {
    expect(
      gpuStartTimeout({ ...base, active: "CPU", sinceStart: 600_000 }),
    ).toBeNull();
    expect(
      gpuStartTimeout({
        ...base,
        ready: true,
        produced: true,
        sinceStart: 600_000,
        sinceFirstFrame: 600_000,
      }),
    ).toBeNull();
  });
  it("keeps both bounds to a few seconds, far below the 45 s load timeout", () => {
    expect(GPU_READY_LIMIT_MS).toBeLessThanOrEqual(10_000);
    expect(GPU_FIRST_RESULT_LIMIT_MS).toBeLessThanOrEqual(10_000);
  });
});

describe("task runner: bounded GPU start and the delegate switch", () => {
  type Fake = {
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
    const runner = createTaskRunner(spec, "http://x/", events, () => {
      const fake: Fake = {
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
  const alive = (workers: Fake[]) => workers.filter((w) => !w.terminated);
  const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap;
  const spec = (delegate: "CPU" | "GPU"): TaskSpec => ({
    kind: "hand",
    model: "hand.task",
    options: {},
    delegate,
  });
  const result = {
    kind: "hand",
    generation: 1,
    time: 5,
    latency: 3,
    delegate: "GPU",
    detections: [],
    landmarks: [],
    handedness: [],
  };

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "performance"],
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    chooseDelegate("hand", null);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("falls back to CPU when a GPU start hangs, within the bound", () => {
    const loads: { delegate: string; requested: string; note?: string }[] = [];
    const off = telemetry.on("model", (event) => loads.push(event));
    const { workers, events, runner } = harness(spec("GPU"));
    // The worker never answers: no ready, no error.
    vi.advanceTimersByTime(GPU_READY_LIMIT_MS - 300);
    expect(workers).toHaveLength(1);
    expect(runner.delegate()).toBe("GPU");
    vi.advanceTimersByTime(600);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].posted[0].task?.delegate).toBe("CPU");
    expect(runner.delegate()).toBe("CPU");
    expect(events.onError).not.toHaveBeenCalled();
    const loading = taskStatus("hand", "hand.task")!;
    expect(loading).toMatchObject({
      requested: "GPU",
      active: "CPU",
      state: "loading",
    });
    expect(loading.note).toMatch(/GPU was requested but .*8 s.*Running on CPU/);
    workers[1].reply({ type: "ready", delegate: "CPU" });
    expect(loads).toHaveLength(1);
    expect(loads[0]).toMatchObject({ requested: "GPU", delegate: "CPU" });
    expect(loads[0].note).toMatch(/Running on CPU/);
    // CPU is never timed out: nothing else happens however long it sits.
    vi.advanceTimersByTime(120_000);
    expect(alive(workers)).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    runner.dispose();
    expect(alive(workers)).toHaveLength(0);
    off();
  });

  it("falls back when GPU loads but its first frame never returns", () => {
    const { workers, runner } = harness(spec("GPU"));
    workers[0].reply({ type: "ready", delegate: "GPU" });
    // Loaded and idle (paused, or no source yet): no clock is running.
    vi.advanceTimersByTime(60_000);
    expect(workers).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    runner.claim(0);
    runner.send(bitmap(), 0, 1, 0.5);
    vi.advanceTimersByTime(GPU_FIRST_RESULT_LIMIT_MS - 300);
    expect(workers).toHaveLength(1);
    vi.advanceTimersByTime(600);
    expect(workers).toHaveLength(2);
    expect(runner.delegate()).toBe("CPU");
    expect(taskStatus("hand", "hand.task")!.note).toMatch(/no result within/);
    runner.dispose();
    expect(alive(workers)).toHaveLength(0);
  });

  it("leaves a working GPU task alone and records its measured start", () => {
    const { workers, runner } = harness(spec("GPU"));
    vi.advanceTimersByTime(1200);
    workers[0].reply({ type: "ready", delegate: "GPU" });
    runner.claim(0);
    runner.send(bitmap(), 0, 1, 0.5);
    vi.advanceTimersByTime(300);
    workers[0].reply({ type: "result", result: { ...result } });
    vi.advanceTimersByTime(120_000);
    expect(workers).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(taskStatus("hand", "hand.task")).toMatchObject({
      requested: "GPU",
      active: "GPU",
      state: "ready",
      loadMs: 1200,
      firstResultMs: 1500,
      note: "",
    });
    runner.dispose();
  });

  it("restarts on the chosen delegate, with one worker alive at a time", () => {
    const { workers, runner, events } = harness(spec("CPU"));
    workers[0].reply({ type: "ready", delegate: "CPU" });
    expect(delegateWatchers()).toBe(1);
    chooseDelegate("pose", "GPU");
    expect(workers).toHaveLength(1);
    chooseDelegate("pose", null);
    chooseDelegate("hand", "GPU");
    expect(chosenDelegate("hand")).toBe("GPU");
    expect(requestedDelegate(spec("CPU"))).toBe("GPU");
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].posted[0].task?.delegate).toBe("GPU");
    expect(runner.ready()).toBe(false);
    // A frame claimed before the switch must not reach the unready worker.
    const stale = bitmap();
    runner.send(stale, 0, 1, 0.5);
    expect(stale.close).toHaveBeenCalled();
    expect(workers[1].posted).toHaveLength(1);
    workers[1].reply({ type: "ready", delegate: "GPU" });
    expect(runner.delegate()).toBe("GPU");
    expect(events.onReady).toHaveBeenCalledTimes(2);
    chooseDelegate("hand", "GPU");
    expect(workers).toHaveLength(2);
    chooseDelegate("hand", null);
    expect(workers).toHaveLength(3);
    expect(workers[2].posted[0].task?.delegate).toBe("CPU");
    expect(alive(workers)).toHaveLength(1);
    runner.dispose();
    expect(alive(workers)).toHaveLength(0);
    expect(delegateWatchers()).toBe(0);
    // A disposed runner ignores the switch.
    chooseDelegate("hand", "GPU");
    expect(workers).toHaveLength(3);
  });

  it("starts a new runner on the delegate already chosen", () => {
    chooseDelegate("hand", "GPU");
    const { workers, runner } = harness(spec("CPU"));
    expect(workers[0].posted[0].task?.delegate).toBe("GPU");
    runner.dispose();
  });
});
