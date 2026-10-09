/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TaskSpec } from "../src/vision/types";

// The settings module reads storage on first use, so each test loads it fresh.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
const load = () => import("../src/vision/settings");

describe("measurement settings", () => {
  it("default to smoothing on and Fast", async () => {
    const s = await load();
    expect(s.smoothingOn()).toBe(true);
    expect(s.getPrecision()).toBe("fast");
  });
  it("are remembered on this device and read back on the next visit", async () => {
    const s = await load();
    s.setSmoothing(false);
    s.setPrecision("precise");
    expect(store.get("spectra.smooth.v1")).toBe("off");
    expect(store.get("spectra.precision.v1")).toBe("precise");
    vi.resetModules();
    const again = await load();
    expect(again.smoothingOn()).toBe(false);
    expect(again.getPrecision()).toBe("precise");
  });
  it("ignore a stored value they do not know", async () => {
    store.set("spectra.precision.v1", "ultra");
    const s = await load();
    expect(s.getPrecision()).toBe("fast");
  });
  it("tell subscribers only about real changes", async () => {
    const s = await load(),
      seen = vi.fn(),
      off = s.onPrecisionChange(seen);
    s.setPrecision("fast");
    s.setPrecision("precise");
    s.setPrecision("precise");
    off();
    s.setPrecision("fast");
    expect(seen).toHaveBeenCalledTimes(1);
  });
  it("work with storage blocked", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    const s = await load();
    s.setSmoothing(false);
    expect(s.smoothingOn()).toBe(false);
  });
  it("pick the precise model only where a task has one", async () => {
    const s = await load(),
      pose = { model: "lite.task", preciseModel: "full.task" },
      hand = { model: "hand.task" };
    expect(s.modelOf(pose)).toBe("lite.task");
    expect(s.modelOf(pose, "precise")).toBe("full.task");
    expect(s.modelOf(hand, "precise")).toBe("hand.task");
    s.setPrecision("precise");
    expect(s.modelOf(pose)).toBe("full.task");
  });
});

describe("the task runner under the Precision setting", () => {
  type Fake = {
    posted: { type: string; task?: TaskSpec }[];
    terminated: boolean;
    onmessage: ((event: MessageEvent) => void) | null;
    onerror: null;
    postMessage(message: unknown): void;
    terminate(): void;
  };
  const spec: TaskSpec = {
    kind: "pose",
    model: "lite.task",
    preciseModel: "full.task",
    options: {},
    delegate: "CPU",
  };
  async function start() {
    const s = await load(),
      { createTaskRunner } = await import("../src/vision/task-runner"),
      workers: Fake[] = [],
      onRestart = vi.fn(),
      onResult = vi.fn(),
      runner = createTaskRunner(
        spec,
        "http://x/",
        { onReady: vi.fn(), onRestart, onResult, onError: vi.fn() },
        () => {
          const w: Fake = {
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
          };
          workers.push(w);
          return w;
        },
      );
    return { s, runner, workers, onRestart, onResult };
  }
  it("loads the Lite model by default and tags results with the model", async () => {
    const { runner, workers, onResult } = await start();
    expect(workers[0].posted[0].task?.model).toBe("lite.task");
    expect(runner.model()).toBe("lite.task");
    workers[0].onmessage!({ data: { type: "ready" } } as MessageEvent);
    workers[0].onmessage!({
      data: {
        type: "result",
        result: {
          kind: "pose",
          generation: 1,
          time: 1,
          latency: 1,
          landmarks: [],
        },
      },
    } as MessageEvent);
    expect(onResult.mock.calls[0][0].model).toBe("lite.task");
    runner.dispose();
  });
  it("starts the precise model on a fresh worker when Precision changes, and back", async () => {
    const { s, runner, workers, onRestart } = await start();
    s.setPrecision("precise");
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted[0].task?.model).toBe("full.task");
    expect(runner.model()).toBe("full.task");
    expect(runner.ready()).toBe(false);
    expect(onRestart).toHaveBeenCalledTimes(1);
    s.setPrecision("fast");
    expect(workers[2].posted[0].task?.model).toBe("lite.task");
    runner.dispose();
    // A disposed runner no longer listens.
    s.setPrecision("precise");
    expect(workers).toHaveLength(3);
  });
  it("starts on the precise model when it was chosen before the mode loaded", async () => {
    const s = await load();
    s.setPrecision("precise");
    vi.resetModules();
    const again = await load(),
      { createTaskRunner } = await import("../src/vision/task-runner"),
      posted: unknown[] = [];
    const runner = createTaskRunner(
      spec,
      "http://x/",
      { onReady() {}, onResult() {}, onError() {} },
      () =>
        ({
          postMessage: (m: unknown) => posted.push(m),
          terminate() {},
          onmessage: null,
          onerror: null,
        }) as never,
    );
    expect(again.getPrecision()).toBe("precise");
    expect((posted[0] as { task: TaskSpec }).task.model).toBe("full.task");
    runner.dispose();
  });
});
