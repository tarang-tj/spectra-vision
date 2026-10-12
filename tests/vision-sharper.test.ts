/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { WebglProbe } from "../src/vision/webgl-probe";

// The page's one WebGL probe, replaced by whatever the test says it saw.
let probe: WebglProbe | null = null;
vi.mock("../src/vision/webgl-probe", () => ({
  probeWebgl: () => probe,
  webgl2Missing: () => probe?.webgl2 === false,
}));

import catalogue from "../scripts/models.json";
import { getMode, tasksOf } from "../src/modes";
import ObjectSharperSetting from "../src/modes/lib/object-sharper-setting";
import { StudioContext } from "../src/studio-context";
import type { Studio } from "../src/studio-context";
import { taskStatus } from "../src/telemetry/task-status";
import {
  GPU_READY_LIMIT_MS,
  chooseDelegate,
  gpuFailure,
} from "../src/vision/delegate";
import {
  SHARPER_MIN_SCORE,
  SHARPER_MODEL,
  SHARPER_READY_LIMIT_MS,
  SHARPER_SIZE,
  refuseSharper,
  resetSharper,
  setSharper,
  sharperBlocked,
  sharperChosen,
  sharperOffered,
  sharperRefusal,
  sharperWatchers,
  workerScript,
} from "../src/vision/detector/sharper";
import { firstDownloadNote } from "../src/vision/first-download";
import { GUARD_RESULTS, resetModelChoice } from "../src/vision/model-choice";
import { modelOf, setPrecision } from "../src/vision/settings";
import { MIN_FRAME_GAP, createTaskRunner } from "../src/vision/task-runner";
import type { TaskResult, TaskSpec } from "../src/vision/types";

const M3 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)",
  SOFTWARE = "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader)",
  SMALL = "efficientdet_lite0.tflite",
  LARGE = "efficientdet_lite2.tflite",
  spec = tasksOf(getMode("objects"))[0];

type Fake = {
  url: string;
  posted: { type: string; task?: TaskSpec }[];
  terminated: boolean;
  onmessage: ((e: MessageEvent) => void) | null;
  onerror: (() => void) | null;
  postMessage(m: unknown): void;
  terminate(): void;
  reply(d: unknown): void;
};
function harness() {
  const workers: Fake[] = [],
    events = {
      onReady: vi.fn(),
      onRestart: vi.fn(),
      onResult: vi.fn(),
      onError: vi.fn(),
    };
  const runner = createTaskRunner(spec, "http://x/", events, (url) => {
    const fake: Fake = {
      url,
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
const result = (latency: number) => ({
  type: "result",
  result: {
    kind: "object",
    generation: 1,
    time: 1,
    latency,
    detections: [],
    landmarks: [],
    handedness: [],
  } as unknown as TaskResult,
});
const work = (w: Fake, count: number, latency: number) => {
  w.reply({ type: "ready", delegate: init(w).delegate });
  for (let i = 0; i < count; i++) w.reply(result(latency));
};
const SHARP_WORKER = "http://x/detector-worker.js",
  MEDIAPIPE_WORKER = "http://x/vision-worker.js";

beforeEach(() => {
  probe = { webgl2: true, renderer: M3 };
  // A browser with WebGPU.
  vi.stubGlobal("navigator", { gpu: {}, onLine: true });
  resetModelChoice();
  resetSharper();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  chooseDelegate("object", "GPU");
  chooseDelegate("object", null);
  setPrecision("fast");
  resetModelChoice();
  resetSharper();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("Sharper, the choice", () => {
  it("is named by Objects with its size from the manifest, and is not the default", () => {
    expect(spec.sharpModel).toBe(SHARPER_MODEL);
    expect(spec.sizes![SHARPER_MODEL]).toBe(
      catalogue.find((m) => m.file === SHARPER_MODEL)!.bytes,
    );
    expect(sharperChosen()).toBe(false);
    expect(modelOf(spec, "fast", "GPU")).toBe(LARGE);
    const { workers, runner } = harness();
    expect(workers[0].url).toBe(MEDIAPIPE_WORKER);
    expect(init(workers[0]).model).toBe(LARGE);
    runner.dispose();
  });
  it("is offered on a real GPU with WebGPU, and nowhere else", () => {
    expect(sharperOffered()).toBe(true);
    probe = { webgl2: true, renderer: SOFTWARE };
    expect(sharperOffered()).toBe(false);
    probe = { webgl2: true, renderer: M3 };
    vi.stubGlobal("navigator", {});
    expect(sharperOffered()).toBe(false);
  });
  it("wins over every other model once chosen, on GPU only", () => {
    setSharper(true);
    expect(modelOf(spec, "fast", "GPU")).toBe(SHARPER_MODEL);
    expect(modelOf(spec, "precise", "GPU")).toBe(SHARPER_MODEL);
    expect(modelOf(spec, "fast", "CPU")).toBe(SMALL);
    expect(modelOf(spec, "precise", "CPU")).toBe(LARGE);
    expect(sharperBlocked("object", "CPU")).toBe("Objects is on CPU here");
  });
  it("never runs in a browser with no WebGPU, and says why", () => {
    setSharper(true);
    vi.stubGlobal("navigator", {});
    expect(modelOf(spec, "fast", "GPU")).toBe(LARGE);
    expect(sharperBlocked("object", "GPU")).toBe("this browser has no WebGPU");
  });
  it("picks the worker script by the model's runtime", () => {
    expect(workerScript("object", SHARPER_MODEL)).toBe("detector-worker.js");
    expect(workerScript("object", LARGE)).toBe("vision-worker.js");
    expect(workerScript("depth", "depth_anything_v2_small.onnx")).toBe(
      "depth-worker.js",
    );
    expect(workerScript("pose", "pose_landmarker_lite.task")).toBe(
      "vision-worker.js",
    );
  });
  it("states its 42 MB before the download", async () => {
    setSharper(true);
    const { runner } = harness(),
      env = {
        caches: { match: async () => undefined },
        registered: async () => false,
      };
    expect(await firstDownloadNote([spec], "http://x/", env)).toBe(
      "Downloading this mode's model: 42 MB, one time",
    );
    runner.dispose();
  });
});

describe("the task runner and Sharper", () => {
  it("runs it in its own worker on GPU, with its size, floor and bytes", () => {
    setSharper(true);
    const { workers, runner } = harness();
    expect(workers[0].url).toBe(SHARP_WORKER);
    expect(init(workers[0])).toMatchObject({
      kind: "object",
      model: SHARPER_MODEL,
      delegate: "GPU",
      options: {
        size: SHARPER_SIZE,
        minScore: SHARPER_MIN_SCORE,
        bytes: 41_535_197,
        maxResults: 20,
      },
    });
    work(workers[0], 1, 130);
    expect(runner.model()).toBe(SHARPER_MODEL);
    expect(taskStatus("object", SHARPER_MODEL)).toMatchObject({
      active: "GPU",
      state: "ready",
    });
    runner.dispose();
  });
  it("does not hand its size or floor to the MediaPipe worker", () => {
    const { workers, runner } = harness();
    expect(init(workers[0]).options).not.toHaveProperty("minScore");
    expect(init(workers[0]).options).not.toHaveProperty("bytes");
    expect(init(workers[0]).options).not.toHaveProperty("size");
    runner.dispose();
  });
  it("stays on MediaPipe on CPU even when chosen", () => {
    probe = { webgl2: true, renderer: SOFTWARE };
    setSharper(true);
    const { workers, runner } = harness();
    expect(workers[0].url).toBe(MEDIAPIPE_WORKER);
    expect(init(workers[0])).toMatchObject({ model: SMALL, delegate: "CPU" });
    expect(sharperBlocked("object")).toBe("Objects is on CPU here");
    runner.dispose();
  });
  it("goes back to MediaPipe on the same delegate when it cannot start, and says so", () => {
    setSharper(true);
    const { workers, runner, events } = harness();
    workers[0].reply({
      type: "error",
      error: "Vision model failed: WebGPU gave no adapter on this device",
    });
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].url).toBe(MEDIAPIPE_WORKER);
    // WebGPU failing says nothing about MediaPipe's GPU path.
    expect(init(workers[1])).toMatchObject({ model: LARGE, delegate: "GPU" });
    expect(gpuFailure("object")).toBeNull();
    expect(events.onError).not.toHaveBeenCalled();
    expect(events.onRestart).toHaveBeenCalledTimes(1);
    expect(runner.model()).toBe(LARGE);
    expect(modelOf(spec)).toBe(LARGE);
    expect(taskStatus("object", LARGE)!.note).toBe(
      "Sharper is not running (WebGPU gave no adapter on this device). Running the standard model.",
    );
    expect(sharperRefusal()).toBe("WebGPU gave no adapter on this device");
    expect(sharperBlocked("object")).toBe(
      "WebGPU gave no adapter on this device",
    );
    // The next runner on this page does not try it again.
    runner.dispose();
    const again = harness();
    expect(again.workers[0].url).toBe(MEDIAPIPE_WORKER);
    again.runner.dispose();
  });
  it("goes back to MediaPipe when the WebGPU device is lost after it worked", () => {
    setSharper(true);
    const { workers, runner, events } = harness();
    work(workers[0], 5, 130);
    workers[0].reply({
      type: "error",
      error:
        "Vision model failed: the WebGPU device was lost (the driver reset)",
    });
    expect(workers[1].url).toBe(MEDIAPIPE_WORKER);
    expect(init(workers[1])).toMatchObject({ model: LARGE, delegate: "GPU" });
    expect(events.onError).not.toHaveBeenCalled();
    work(workers[1], 1, 60);
    expect(events.onResult.mock.calls.at(-1)![0]).toMatchObject({
      model: LARGE,
      delegate: "GPU",
    });
    runner.dispose();
  });
  it("goes back to MediaPipe when its file cannot be fetched", () => {
    setSharper(true);
    const { workers, runner, events } = harness();
    workers[0].reply({
      type: "error",
      error: `Vision model failed: HTTP 404 for http://x/models/${SHARPER_MODEL}`,
    });
    expect(workers[1].url).toBe(MEDIAPIPE_WORKER);
    expect(init(workers[1])).toMatchObject({ model: LARGE, delegate: "GPU" });
    expect(events.onError).not.toHaveBeenCalled();
    expect(taskStatus("object", LARGE)!.note).toMatch(
      /^Sharper is not running \(.+\)\. Running the standard model\.$/,
    );
    runner.dispose();
  });
  it("goes back to MediaPipe when its worker dies", () => {
    setSharper(true);
    const { workers, runner, events } = harness();
    workers[0].onerror!();
    expect(workers[1].url).toBe(MEDIAPIPE_WORKER);
    expect(sharperRefusal()).toBe("its worker stopped");
    expect(events.onError).not.toHaveBeenCalled();
    runner.dispose();
  });
  it("follows the choice while running, and choosing it again retries after a failure", () => {
    const { workers, runner, events } = harness();
    work(workers[0], 2, 60);
    setSharper(true);
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].url).toBe(SHARP_WORKER);
    expect(events.onRestart).toHaveBeenCalledTimes(1);
    workers[1].reply({ type: "error", error: "Vision model failed: no" });
    expect(workers[2].url).toBe(MEDIAPIPE_WORKER);
    // Chosen already: pressing it again after off forgets the failure.
    setSharper(false);
    expect(workers).toHaveLength(3);
    setSharper(true);
    expect(sharperRefusal()).toBeNull();
    expect(workers[3].url).toBe(SHARP_WORKER);
    setSharper(false);
    expect(workers[4].url).toBe(MEDIAPIPE_WORKER);
    expect(init(workers[4]).model).toBe(LARGE);
    runner.dispose();
  });
  it("gives its slow first pass longer than a MediaPipe GPU start, but not for ever", () => {
    vi.useFakeTimers();
    setSharper(true);
    const { workers, runner } = harness();
    workers[0].reply({ type: "downloaded" });
    vi.advanceTimersByTime(GPU_READY_LIMIT_MS + 2000);
    expect(workers).toHaveLength(1);
    vi.advanceTimersByTime(SHARPER_READY_LIMIT_MS);
    expect(workers).toHaveLength(2);
    expect(workers[1].url).toBe(MEDIAPIPE_WORKER);
    expect(sharperRefusal()).toBe(
      `it did not start within ${SHARPER_READY_LIMIT_MS / 1000} s`,
    );
    runner.dispose();
  });
  it("is not put on the larger model's latency trial", () => {
    setSharper(true);
    const { workers, runner } = harness();
    work(workers[0], GUARD_RESULTS + 5, 400);
    expect(workers).toHaveLength(1);
    expect(sharperRefusal()).toBeNull();
    runner.dispose();
  });
  it("takes one frame at a time: nothing is sent while one is in flight", () => {
    setSharper(true);
    const { workers, runner } = harness();
    work(workers[0], 0, 0);
    expect(runner.wants(1000)).toBe(true);
    runner.claim(1000);
    runner.send({ close() {} } as ImageBitmap, 1000, 1, 0.45);
    // Seconds later the slow frame is still out: no second one is wanted.
    expect(runner.wants(1000 + 50 * MIN_FRAME_GAP)).toBe(false);
    expect(workers[0].posted.filter((m) => m.type === "frame")).toHaveLength(1);
    workers[0].reply(result(900));
    expect(runner.wants(1000 + 50 * MIN_FRAME_GAP)).toBe(true);
    runner.dispose();
  });
  it("stops listening to the choice when it is disposed", () => {
    const before = sharperWatchers(),
      { workers, runner } = harness();
    expect(sharperWatchers()).toBe(before + 1);
    runner.dispose();
    expect(sharperWatchers()).toBe(before);
    setSharper(true);
    expect(workers).toHaveLength(1);
  });
});

describe("Objects: the Sharper setting", () => {
  const text = (task?: { model: string; delegate: string }) =>
    renderToStaticMarkup(
      createElement(
        StudioContext.Provider,
        {
          value: {
            frame: { result: task ? { tasks: { object: task } } : null },
          } as unknown as Studio,
        },
        createElement(ObjectSharperSetting, { spec }),
      ),
    ).replace(/<!-- -->/g, "");
  it("is a third choice, off by default, that states its download first", () => {
    const html = text();
    expect(html).toContain("Sharper (GPU)</button>");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Downloads a 42 MB model the first time it is on.");
    expect(html).toContain("It shows nothing it scores under 45%");
    expect(html).not.toContain("not running");
  });
  it("is not offered at all on CPU", () => {
    probe = { webgl2: true, renderer: SOFTWARE };
    expect(text()).toBe("");
  });
  it("is not offered in a browser with no WebGPU", () => {
    vi.stubGlobal("navigator", {});
    expect(text()).toBe("");
  });
  it("says in one line that it is not running where it was chosen and cannot run", () => {
    setSharper(true);
    probe = { webgl2: true, renderer: SOFTWARE };
    const html = text({ model: SMALL, delegate: "CPU" });
    // No button to press here, only the line.
    expect(html).not.toContain("<button");
    expect(html).toContain(
      "Sharper is not running: Objects is on CPU here. The standard model is running instead.",
    );
    expect(html).not.toContain("Downloads");
    expect(html).not.toContain("try it again");
  });
  it("says why it stopped on this page, and how to try again", () => {
    setSharper(true);
    refuseSharper("the WebGPU device was lost (the driver reset)");
    const html = text({ model: LARGE, delegate: "GPU" });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(
      "Sharper is not running: the WebGPU device was lost (the driver reset). The standard model is running instead. Switch Sharper off and on to try it again.",
    );
  });
  it("says nothing of the kind while it runs", () => {
    setSharper(true);
    expect(text({ model: SHARPER_MODEL, delegate: "GPU" })).not.toContain(
      "not running",
    );
  });
});
