/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { WebglProbe } from "../src/vision/webgl-probe";

// The page's one WebGL probe, replaced by whatever the test says it saw.
let probe: WebglProbe | null = null;
vi.mock("../src/vision/webgl-probe", () => ({
  probeWebgl: () => probe,
  webgl2Missing: () => probe?.webgl2 === false,
}));

import { getMode, modes, tasksOf } from "../src/modes";
import {
  getDepthView,
  resetDepthView,
  resetTurn,
  setDepthView,
  turnView,
} from "../src/modes/lib/depth-store";
import { resetRuler } from "../src/panels/ruler/store";
import { taskStatus } from "../src/telemetry/task-status";
import { chooseDelegate } from "../src/vision/delegate";
import { PITCH_LIMIT, YAW_LIMIT } from "../src/vision/depth/orbit";
import { createTaskRunner } from "../src/vision/task-runner";
import type { TaskSpec, VisionResult } from "../src/vision/types";

const depth = getMode("depth"),
  spec = tasksOf(depth)[0];
const M3 = "ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)";

describe("the Depth mode", () => {
  it("is registered last, after Fusion, with one depth task", () => {
    const ids = modes.map((m) => m.id);
    expect(ids.indexOf("depth")).toBe(ids.indexOf("fusion") + 1);
    expect(ids[ids.length - 1]).toBe("depth");
    expect(tasksOf(depth).map((t) => t.kind)).toEqual(["depth"]);
    expect(spec.delegate).toBe("AUTO");
  });
  it("ships labelled demo inputs that exist", () => {
    expect(depth.demo.label).toMatch(/^Demo /);
    expect(existsSync(resolve("public", depth.demo.still))).toBe(true);
    expect(existsSync(resolve("public", depth.demo.motion!))).toBe(true);
  });
  it("names a model pinned in the manifest to one commit and one hash", () => {
    const entry = JSON.parse(
      readFileSync(resolve("scripts/models.json"), "utf8"),
    ).find((m: { file: string }) => m.file === spec.model);
    expect(entry).toMatchObject({
      bytes: 99060839,
      sha256:
        "afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c",
      license: "Apache-2.0",
    });
    expect(entry.url).toMatch(
      /^https:\/\/huggingface\.co\/onnx-community\/depth-anything-v2-small\/resolve\/[0-9a-f]{40}\/onnx\/model\.onnx$/,
    );
    expect(entry.card).toMatch(/^https:\/\/huggingface\.co\//);
  });
  it("names the model and the runtime in the third party notices", () => {
    const notices = readFileSync(resolve("THIRD_PARTY_NOTICES.md"), "utf8");
    expect(notices).toMatch(/Depth Anything V2 Small/);
    expect(notices).toMatch(/onnxruntime-web/);
    expect(notices).toContain(spec.model);
  });

  it("exports a summary of each map and never the map", () => {
    resetRuler();
    const values = new Float32Array(308 * 196).fill(1.5);
    values[7] = 4.25;
    values[9] = 0.5;
    const result = {
      mode: "depth",
      generation: 2,
      tasks: {
        depth: {
          kind: "depth",
          generation: 2,
          delegate: "CPU",
          latency: 900,
          extra: { width: 308, height: 196, values, min: 0.5, max: 4.25 },
        },
      },
    } as unknown as VisionResult;
    const exported = depth.exportFrame!(result);
    expect(exported).toEqual({
      depth: {
        width: 308,
        height: 196,
        min: 0.5,
        max: 4.25,
        delegate: "CPU",
        metric: false,
      },
    });
    expect(JSON.stringify(exported).length).toBeLessThan(200);
    // A result with no map exports nothing.
    expect(
      depth.exportFrame!({ ...result, tasks: {} } as VisionResult),
    ).toEqual({});
    expect(depth.inspector({ result: null } as never)).toEqual([]);
  });
});

describe("the Depth view settings", () => {
  beforeEach(() => resetDepthView());
  it("starts on the map and keeps the turn inside its limits", () => {
    expect(getDepthView()).toMatchObject({ view: "map", yaw: 0, pitch: 0 });
    turnView(400, -400);
    expect(getDepthView()).toMatchObject({
      yaw: YAW_LIMIT,
      pitch: -PITCH_LIMIT,
    });
    resetTurn();
    expect(getDepthView()).toMatchObject({ yaw: 0, pitch: 0 });
    setDepthView({ opacity: 7 });
    expect(getDepthView().opacity).toBe(1);
    setDepthView({ opacity: -1 });
    expect(getDepthView().opacity).toBe(0);
  });
  it("replaces the state only when something changed", () => {
    const before = getDepthView();
    setDepthView({ view: "map" });
    expect(getDepthView()).toBe(before);
    setDepthView({ view: "cloud" });
    expect(getDepthView()).not.toBe(before);
  });
});

// The runner's fallback rules, with a stand-in worker: Depth must obey them
// like every other task.
type Fake = {
  url: string;
  posted: { task?: TaskSpec }[];
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

describe("the Depth task's worker and delegate", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    // Forgets the remembered GPU failure and the Lab choice.
    chooseDelegate("depth", "GPU");
    chooseDelegate("depth", null);
    vi.restoreAllMocks();
  });

  it("runs in its own worker script, on GPU where the page has a hardware renderer", () => {
    probe = { webgl2: true, renderer: M3 };
    const { workers, runner } = harness();
    expect(workers[0].url).toBe("http://x/depth-worker.js");
    expect(workers[0].posted[0].task).toMatchObject({
      kind: "depth",
      model: "depth_anything_v2_small.onnx",
      delegate: "GPU",
      options: { size: { CPU: 196, GPU: 392 } },
    });
    runner.dispose();
  });

  it("starts on CPU on a software renderer and says why", () => {
    probe = {
      webgl2: true,
      renderer:
        "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device), SwiftShader)",
    };
    const { workers, runner } = harness();
    expect(workers[0].posted[0].task?.delegate).toBe("CPU");
    runner.dispose();
  });

  it("falls back to CPU once when WebGPU is missing, with a truthful note", () => {
    probe = { webgl2: true, renderer: M3 };
    const { workers, events, runner } = harness();
    workers[0].reply({
      type: "error",
      error: "Vision model failed: this browser has no WebGPU",
    });
    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    expect(workers[1].url).toBe("http://x/depth-worker.js");
    expect(workers[1].posted[0].task?.delegate).toBe("CPU");
    expect(events.onRestart).toHaveBeenCalledTimes(1);
    expect(events.onError).not.toHaveBeenCalled();
    workers[1].reply({ type: "ready", delegate: "CPU" });
    expect(runner.delegate()).toBe("CPU");
    expect(taskStatus("depth", spec.model)!.note).toBe(
      "GPU was requested but this browser has no WebGPU. Running on CPU.",
    );
    // The runner, not the worker, says what a result ran on.
    workers[1].reply({
      type: "result",
      result: { kind: "depth", delegate: "GPU", time: 1, latency: 900 },
    });
    expect(events.onResult.mock.calls[0][0]).toMatchObject({
      kind: "depth",
      delegate: "CPU",
      model: spec.model,
    });
    // A CPU failure after that is a real error: no second fallback.
    workers[1].reply({ type: "error", error: "Vision model failed: boom" });
    expect(workers).toHaveLength(2);
    expect(events.onError).toHaveBeenCalledWith("Vision model failed: boom");
    runner.dispose();
  });
});
