/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebglProbe } from "../src/vision/webgl-probe";

// A hardware renderer, so an AUTO task starts on GPU as it does on a laptop.
const probe: WebglProbe = {
  webgl2: true,
  renderer:
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
};
vi.mock("../src/vision/webgl-probe", () => ({
  probeWebgl: () => probe,
  webgl2Missing: () => false,
}));

import { taskStatus } from "../src/telemetry/task-status";
import { gpuFailure } from "../src/vision/delegate";
import {
  downloadFailure,
  OFFLINE_MESSAGE,
} from "../src/vision/download-failure";
import { createTaskRunner } from "../src/vision/task-runner";
import type { TaskSpec } from "../src/vision/types";

type Fake = {
  posted: { task?: TaskSpec }[];
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
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
      postMessage(m) {
        this.posted.push(m as Fake["posted"][number]);
      },
      terminate() {},
    };
    workers.push(fake);
    return fake;
  });
  const reply = (at: number, data: unknown) =>
    workers[at].onmessage?.({ data } as MessageEvent);
  return { workers, events, runner, reply };
}
// What Chrome's fetch rejects with when there is no connection, as the
// worker reports it.
const FETCH = "Vision model failed: Failed to fetch";
const spec = (kind: TaskSpec["kind"]): TaskSpec => ({
  kind,
  model: `${kind}.task`,
  options: {},
  delegate: "AUTO",
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downloadFailure", () => {
  it("says the device is offline when a fetch fails with no connection", () => {
    expect(downloadFailure(FETCH, false)).toBe(OFFLINE_MESSAGE);
    expect(OFFLINE_MESSAGE).toMatch(/^This device is offline/);
    expect(OFFLINE_MESSAGE).not.toMatch(/GPU/);
  });
  it("names the failed download when the device says it is online", () => {
    for (const error of [
      FETCH,
      "Vision model failed: NetworkError when attempting to fetch resource.",
      "Vision model failed: Load failed",
      "Vision model failed: HTTP 404 for http://x/models/pose.task",
    ]) {
      const said = downloadFailure(error, true);
      expect(said, error).toMatch(/^The model could not be downloaded \(/);
      expect(said, error).not.toMatch(/offline|GPU/);
    }
  });
  it("leaves every other failure alone", () => {
    for (const error of [
      "Vision model failed: the graphics process ended and the GPU context was lost",
      "GPU did not load within 8 s",
      "Vision model failed: this browser has no WebGPU",
    ]) {
      expect(downloadFailure(error, true), error).toBeNull();
      expect(downloadFailure(error, false), error).toBeNull();
    }
  });
  it("counts a worker that could not start while offline as a download", () => {
    const error =
      "Vision worker failed. Retry or use a current Chrome/Edge browser.";
    expect(downloadFailure(error, false)).toBe(OFFLINE_MESSAGE);
    expect(downloadFailure(error, true)).toBeNull();
  });
});

describe("a model that cannot be fetched", () => {
  it("offline: one fetch, the offline message, and no GPU failure on record", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const h = harness(spec("pose"));
    expect(h.workers[0].posted[0].task?.delegate).toBe("GPU");
    h.reply(0, { type: "error", error: FETCH });
    // No second worker: the same fetch would only fail again on CPU.
    expect(h.workers).toHaveLength(1);
    expect(h.events.onError).toHaveBeenCalledExactlyOnceWith(OFFLINE_MESSAGE);
    expect(gpuFailure("pose")).toBeNull();
    expect(console.warn).not.toHaveBeenCalled();
    expect(taskStatus("pose", "pose.task")).toMatchObject({
      state: "failed",
      note: OFFLINE_MESSAGE,
    });
    // Back online, the next runner of this kind asks for GPU again.
    vi.stubGlobal("navigator", { onLine: true });
    const again = harness(spec("pose"));
    expect(again.workers[0].posted[0].task?.delegate).toBe("GPU");
  });
  it("online: the failed download is named and GPU is not blamed", () => {
    const h = harness(spec("gesture"));
    h.reply(0, { type: "error", error: FETCH });
    expect(h.workers).toHaveLength(1);
    expect(h.events.onError.mock.calls[0][0]).toBe(
      "The model could not be downloaded (Failed to fetch). Check your connection and retry.",
    );
    expect(gpuFailure("gesture")).toBeNull();
  });
  it("Depth, whose GPU path loads files of its own: a failed fetch on GPU tries CPU once, without blaming the GPU", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const h = harness(spec("depth"));
    expect(h.workers[0].posted[0].task?.delegate).toBe("GPU");
    h.reply(0, { type: "error", error: FETCH });
    // The CPU files may be on the device when the GPU ones are not.
    expect(h.workers).toHaveLength(2);
    expect(h.workers[1].posted[0].task?.delegate).toBe("CPU");
    expect(h.events.onError).not.toHaveBeenCalled();
    expect(gpuFailure("depth")).toBeNull();
    expect(taskStatus("depth", "depth.task")?.note).toContain(
      "could not be downloaded",
    );
    // CPU cannot fetch its files either: now it is said, and not tried again.
    h.reply(1, { type: "error", error: FETCH });
    expect(h.workers).toHaveLength(2);
    expect(h.events.onError).toHaveBeenCalledExactlyOnceWith(OFFLINE_MESSAGE);
    expect(gpuFailure("depth")).toBeNull();
  });
  it("a GPU failure that is not a download still falls back to CPU and is recorded", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const h = harness(spec("segment"));
    h.reply(0, { type: "error", error: "Vision model failed: no shader" });
    expect(h.workers).toHaveLength(2);
    expect(h.workers[1].posted[0].task?.delegate).toBe("CPU");
    expect(gpuFailure("segment")).toBe("no shader");
    expect(h.events.onError).not.toHaveBeenCalled();
  });
  it("a precise model that cannot be fetched gives way to the standard one on the same delegate", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const precise: TaskSpec = { ...spec("object"), preciseModel: "big.task" };
    vi.stubGlobal("localStorage", {
      getItem: () => "precise",
      setItem() {},
      removeItem() {},
    });
    return import("../src/vision/settings").then(({ setPrecision }) => {
      setPrecision("precise");
      const h = harness(precise);
      expect(h.workers[0].posted[0].task?.model).toBe("big.task");
      h.reply(0, { type: "error", error: FETCH });
      expect(h.workers).toHaveLength(2);
      expect(h.workers[1].posted[0].task).toMatchObject({
        model: "object.task",
        delegate: "GPU",
      });
      expect(gpuFailure("object")).toBeNull();
      setPrecision("fast");
    });
  });
});
