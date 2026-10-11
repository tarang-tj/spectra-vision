/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, describe, expect, it } from "vitest";
import { HOLD } from "../src/modes/lib/gesture-log";
import depth from "../src/modes/depth";
import { modes, tasksOf } from "../src/modes";
import { telemetry } from "../src/telemetry/bus";
import {
  addInferenceHold,
  createStillGate,
  createStillPacer,
  inferenceHeldBy,
  onStillState,
  SETTLE_RESULTS,
  setStillState,
  STILL_GAP_MS,
  stillState,
  stillWords,
} from "../src/vision/still";
import "../src/vision/still-holds";
import { createTaskRunner, MIN_FRAME_GAP } from "../src/vision/task-runner";
import { STEADY_TRACKER } from "../src/vision/tracker";

/** Drive a gate the way the frame tick does, 60 times a second from `from`
 * to `to` ms: each task is sent a frame when its own 65 ms gap and the gate
 * allow it, and answers at once. Returns the send times per task. */
function run(
  gate: ReturnType<typeof createStillGate>,
  tasks: number,
  from: number,
  to: number,
  source: { image: boolean; generation: number; confidence: number },
  resting = false,
) {
  const sends = Array.from({ length: tasks }, () => [] as number[]),
    last = sends.map((list) => list.at(-1) ?? -Infinity);
  for (let time = from; time < to; time += 1000 / 60) {
    const paced = gate.tick(
      source.image,
      source.generation,
      source.confidence,
      resting,
    );
    if (resting) continue;
    for (let i = 0; i < tasks; i++) {
      if (time - last[i] < MIN_FRAME_GAP) continue;
      if (paced && !gate.allows(i, time)) continue;
      last[i] = time;
      gate.sent(i, time);
      sends[i].push(time);
      gate.counted(i);
    }
  }
  return sends;
}
const still = { image: true, generation: 1, confidence: 0.45 };
const perSecond = (times: number[], from: number, to: number) =>
  (times.filter((t) => t >= from && t < to).length * 1000) / (to - from);

afterEach(() => setStillState({ state: "live" }));

describe("how often a still picture is inferred", () => {
  it("the full-rate run covers what counts results: the gesture hold and a track's second hit", () => {
    expect(SETTLE_RESULTS).toBeGreaterThan(HOLD);
    expect(SETTLE_RESULTS).toBeGreaterThanOrEqual(STEADY_TRACKER.minHits);
  });
  it("a still picture: a short full-rate run, then one inference a second", () => {
    const gate = createStillGate([false]),
      [sends] = run(gate, 1, 0, 20_000, still);
    // The run: SETTLE_RESULTS frames at the runner's own 65 ms gap.
    expect(sends.slice(0, SETTLE_RESULTS).at(-1)!).toBeLessThan(400);
    // Then about one a second for the 19 s that follow, not fifteen.
    const rate = perSecond(sends, 1000, 20_000);
    expect(rate).toBeGreaterThan(0.9);
    expect(rate).toBeLessThanOrEqual(1);
    expect(sends.length).toBeLessThan(SETTLE_RESULTS + 21);
    expect(stillState()).toEqual({ state: "still", perSecond: 1 });
  });
  it("a video is never paced: about fifteen a second for as long as it plays", () => {
    const gate = createStillGate([false]),
      [sends] = run(gate, 1, 0, 10_000, { ...still, image: false });
    expect(perSecond(sends, 0, 10_000)).toBeGreaterThan(14);
    expect(stillState()).toEqual({ state: "live" });
  });
  it("a task that asks for one result gets one, then nothing", () => {
    const gate = createStillGate([true]),
      [sends] = run(gate, 1, 0, 30_000, still);
    expect(sends).toHaveLength(1);
    expect(stillState()).toEqual({ state: "still", perSecond: 0 });
  });
  it("resumes at once on a new picture, a new confidence, a resume, a restart or a live option", () => {
    const gate = createStillGate([true]);
    let at = 0;
    const more = (source = still, resting = false) => {
      const [sends] = run(gate, 1, at, at + 3000, source, resting);
      at += 3000;
      return sends;
    };
    expect(more()).toHaveLength(1);
    expect(more()).toHaveLength(0);
    // A new picture.
    const next = { ...still, generation: 2 },
      first = more(next);
    expect(first).toHaveLength(1);
    // "At once": on the very first tick after the change.
    expect(first[0]).toBeCloseTo(at - 3000, 5);
    expect(more(next)).toHaveLength(0);
    // The confidence slider.
    const surer = { ...next, confidence: 0.6 };
    expect(more(surer)).toHaveLength(1);
    // Paused: nothing. Resumed: one more.
    expect(more(surer, true)).toHaveLength(0);
    expect(stillState()).toEqual({ state: "live" });
    expect(more(surer)).toHaveLength(1);
    expect(more(surer)).toHaveLength(0);
    // A runner restart (delegate, precision, fallback) or a live option.
    gate.wake();
    expect(more(surer)).toHaveLength(1);
  });
  it("in a mode with several tasks each keeps its own count", () => {
    const gate = createStillGate([false, false, true]),
      sends = run(gate, 3, 0, 10_000, still);
    expect(sends[2]).toHaveLength(1);
    for (const list of sends.slice(0, 2)) {
      expect(list.length).toBeGreaterThanOrEqual(SETTLE_RESULTS + 9);
      expect(list.length).toBeLessThanOrEqual(SETTLE_RESULTS + 10);
    }
    // Not settled until the slowest task has had its run.
    const pacer = createStillPacer([false, false]);
    for (let n = 0; n < SETTLE_RESULTS; n++) pacer.counted(0);
    expect(pacer.settled()).toBe(false);
    for (let n = 0; n < SETTLE_RESULTS; n++) pacer.counted(1);
    expect(pacer.settled()).toBe(true);
    expect(STILL_GAP_MS).toBe(1000);
  });
});

describe("what keeps a still picture running", () => {
  it("a hold keeps the full rate on for as long as it stands, and is named", () => {
    let measuring = false;
    const off = addInferenceHold(() => (measuring ? "a test bench" : null)),
      gate = createStillGate([true]);
    expect(run(gate, 1, 0, 3000, still)[0]).toHaveLength(1);
    measuring = true;
    const [held] = run(gate, 1, 3000, 13_000, still);
    expect(perSecond(held, 3000, 13_000)).toBeGreaterThan(14);
    expect(stillState()).toEqual({ state: "held", by: "a test bench" });
    measuring = false;
    // Released: the picture is left alone again, with no extra run.
    expect(run(gate, 1, 13_000, 16_000, still)[0]).toHaveLength(0);
    expect(stillState()).toEqual({ state: "still", perSecond: 0 });
    off();
    measuring = true;
    expect(inferenceHeldBy()).toBeNull();
  });
  it("the Lab holds it while it listens for inferences, and only then", () => {
    expect(inferenceHeldBy()).toBeNull();
    const off = telemetry.on("inference", () => {});
    expect(inferenceHeldBy()).toBe("the Lab");
    off();
    expect(inferenceHeldBy()).toBeNull();
    // Listening for merged results (the Library, the test probe) is no hold.
    const offResult = telemetry.on("result", () => {});
    expect(inferenceHeldBy()).toBeNull();
    offResult();
  });
});

describe("what the readout says", () => {
  it("names a still picture instead of a rate nobody is measuring", () => {
    expect(stillWords({ state: "still", perSecond: 1 })).toEqual({
      value: "still picture",
      note: "checked once a second",
    });
    expect(stillWords({ state: "still", perSecond: 0 })).toEqual({
      value: "still picture",
      note: "inferred once",
    });
    expect(stillWords({ state: "held", by: "the Lab" })).toEqual({
      value: "",
      note: "kept running for the Lab",
    });
    for (const state of ["live", "settling"] as const)
      expect(stillWords({ state })).toEqual({ value: "", note: "" });
  });
  it("tells its watchers only when something changed", () => {
    let told = 0;
    const off = onStillState(() => told++);
    setStillState({ state: "settling" });
    setStillState({ state: "settling" });
    setStillState({ state: "still", perSecond: 1 });
    setStillState({ state: "still", perSecond: 1 });
    setStillState({ state: "still", perSecond: 0 });
    setStillState({ state: "held", by: "the Lab" });
    setStillState({ state: "held", by: "the Lab" });
    expect(told).toBe(4);
    off();
  });
  it("every mode's task can still be posted to its worker", () => {
    // A worker message is cloned; a function in it throws (DataCloneError).
    for (const m of modes)
      for (const spec of tasksOf(m)) {
        const posted: unknown[] = [],
          runner = createTaskRunner(
            spec,
            "http://x/",
            { onReady() {}, onResult() {}, onError() {} },
            () => ({
              onmessage: null,
              onerror: null,
              terminate() {},
              postMessage: (message: unknown) =>
                void posted.push(structuredClone(message)),
            }),
          );
        expect(posted, `${m.id} ${spec.kind}`).toHaveLength(1);
        runner.dispose();
      }
  });
  it("Depth is the only mode that asks for one result, and it restates its readout", () => {
    const once = modes
      .filter((m) => tasksOf(m).some((t) => t.still === "once"))
      .map((m) => m.id);
    expect(once).toEqual(["depth"]);
    expect(typeof tasksOf(depth)[0].restate).toBe("function");
  });
});
