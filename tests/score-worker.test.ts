/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, vi } from "vitest";
import {
  runScorecard,
  type RunIo,
} from "../src/panels/lab/scorecard/score-run";
import type { ScoreSet } from "../src/panels/lab/scorecard/score-set";
import {
  FLOOR,
  MAX_BOXES,
  openScoreWorker,
  readBoxes,
  targetsFor,
  type ScoreWorker,
  type Target,
} from "../src/panels/lab/scorecard/score-worker";
import { SHARPER_MODEL } from "../src/vision/detector/sharper";

// The scorecard's worker client against a stand-in worker: what it posts,
// what it reads back, and that a failure is a failed run and nothing else.
type Message = Record<string, unknown>;
class StandIn {
  static made: StandIn[] = [];
  posted: Message[] = [];
  terminated = 0;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  constructor(readonly url: string) {
    StandIn.made.push(this);
  }
  postMessage(message: Message) {
    this.posted.push(message);
  }
  terminate() {
    this.terminated++;
  }
  say(data: Message) {
    this.onmessage!({ data } as MessageEvent);
  }
}
const open = (
  target: Target,
  limits?: Parameters<typeof openScoreWorker>[3],
) => {
  StandIn.made = [];
  const client = openScoreWorker(
    target,
    "http://site/",
    (url) => new StandIn(url),
    limits,
  );
  return { client, worker: StandIn.made[0] };
};
const LITE0 = "efficientdet_lite0.tflite",
  all = [LITE0, "efficientdet_lite2.tflite", SHARPER_MODEL],
  box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 },
  det = (score: number, label = "cup") => ({ label, score, box });
const [lite0Cpu] = targetsFor([LITE0], ["CPU"]),
  [sharper] = targetsFor([SHARPER_MODEL], ["GPU"], () => 41_535_197);

describe("scorecard targets", () => {
  it("names five rows: both EfficientDets on both delegates, Sharper on GPU only", () => {
    expect(targetsFor(all, ["CPU", "GPU"]).map((t) => t.id)).toEqual([
      `${LITE0}:CPU`,
      `${LITE0}:GPU`,
      "efficientdet_lite2.tflite:CPU",
      "efficientdet_lite2.tflite:GPU",
      `${SHARPER_MODEL}:GPU`,
    ]);
    expect(targetsFor([SHARPER_MODEL], ["CPU"])).toEqual([]);
  });
  it("asks every model for boxes down to 5% and at most 100 a picture", () => {
    expect(lite0Cpu.options).toEqual({ scoreThreshold: 0.05, maxResults: 100 });
    expect(lite0Cpu.send).toBe(0.05);
    expect(lite0Cpu.script).toBe("vision-worker.js");
    expect(sharper.script).toBe("detector-worker.js");
    expect(sharper.options).toEqual({
      size: 640,
      minScore: sharper.send,
      maxResults: 100,
      bytes: 41_535_197,
    });
  });
  it("never gives Sharper a decode floor of 0 or less", () => {
    // The worker decodes down to the larger of minScore and confidence, less 0.15.
    const floor =
      Math.max(Number(sharper.options.minScore), sharper.send) - 0.15;
    expect(floor).toBeGreaterThan(0);
    expect(floor).toBeCloseTo(FLOOR, 12);
  });
});

describe("reading a worker answer", () => {
  it("adds the faint band for Sharper only and drops boxes under 5%", () => {
    const result = {
      latency: 12,
      detections: [det(0.9), det(0.3)],
      extra: { faint: [det(0.12, "bowl"), det(0.04, "vase")] },
    };
    expect(readBoxes(sharper, result).map((b) => b.score)).toEqual([
      0.9, 0.3, 0.12,
    ]);
    expect(readBoxes(lite0Cpu, result).map((b) => b.score)).toEqual([0.9, 0.3]);
    expect(
      readBoxes(lite0Cpu, { detections: [det(0.049), det(0.05)] }),
    ).toHaveLength(1);
  });
  it("keeps the strongest 100 and the worker's order among equal scores", () => {
    const many = Array.from({ length: 130 }, (_, i) =>
      det(i < 3 ? 0.5 : 0.06 + i / 1000, `n${i}`),
    );
    const read = readBoxes(lite0Cpu, { detections: many });
    expect(read).toHaveLength(MAX_BOXES);
    expect(read.slice(0, 3).map((b) => b.label)).toEqual(["n0", "n1", "n2"]);
  });
});

describe("the worker client", () => {
  it("sends the documented init and frame messages", async () => {
    const { client, worker } = open(sharper);
    const ready = client.ready();
    expect(worker.url).toBe("http://site/detector-worker.js");
    expect(worker.posted[0]).toEqual({
      type: "init",
      base: "http://site/",
      task: {
        kind: "object",
        model: SHARPER_MODEL,
        delegate: "GPU",
        options: sharper.options,
      },
    });
    worker.say({ type: "downloaded" });
    worker.say({ type: "ready", delegate: "GPU", files: [] });
    await ready;
    const bitmap = {} as ImageBitmap,
      answer = client.detect(bitmap);
    expect(worker.posted[1]).toEqual({
      type: "frame",
      bitmap,
      time: 100,
      generation: 0,
      confidence: sharper.send,
    });
    worker.say({
      type: "result",
      result: {
        latency: 7,
        detections: [det(0.8)],
        extra: { faint: [det(0.1)] },
      },
    });
    expect(await answer).toEqual({ latency: 7, boxes: [det(0.8), det(0.1)] });
    client.close();
    expect(worker.terminated).toBe(1);
  });
  it("reports an error message as a failure and makes no second attempt", async () => {
    const { client, worker } = open({ ...lite0Cpu, delegate: "GPU" });
    const ready = client.ready();
    worker.say({ type: "error", error: "Vision model failed: no GPU here" });
    await expect(ready).rejects.toThrow("no GPU here");
    await expect(client.detect({} as ImageBitmap)).rejects.toThrow(
      "no GPU here",
    );
    // One worker, one init, and nothing sent after the failure.
    expect(StandIn.made).toHaveLength(1);
    expect(worker.posted).toHaveLength(1);
    expect((worker.posted[0].task as Target).delegate).toBe("GPU");
  });
  it("reports a start that runs out of time as a failure", async () => {
    vi.useFakeTimers();
    try {
      const { client, worker } = open(lite0Cpu, {
        download: 1000,
        start: 500,
        picture: 200,
      });
      const ready = client.ready(),
        caught = expect(ready).rejects.toThrow(
          "the model did not start within 1 s",
        );
      worker.say({ type: "downloaded" });
      await vi.advanceTimersByTimeAsync(600);
      await caught;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the run loop", () => {
  const item = (id: number) => ({
      id,
      file: `${id}.jpg`,
      width: 200,
      height: 100,
    }),
    set = { items: [item(1), item(2), item(3)] } as unknown as ScoreSet;
  function io(over: Partial<RunIo> = {}) {
    const log: string[] = [],
      seen: string[] = [];
    let paused = false;
    const worker = (target: Target): ScoreWorker => ({
      ready: async () => void log.push(`ready ${target.id}`),
      detect: async () => ({ latency: 5, boxes: [det(0.6)] }),
      close: () => void log.push(`close ${target.id}`),
    });
    const made: RunIo = {
      fetchSet: async () => set,
      fetchPicture: async (picture) => {
        seen.push(picture.file);
        return new Blob();
      },
      bitmap: async () => ({}) as ImageBitmap,
      open: worker,
      hash: async () => "abc",
      refused: () => null,
      paused: () => paused,
      setPaused: (value) => {
        paused = value;
        log.push(`paused ${value}`);
      },
      ...over,
    };
    return { made, log, seen };
  }
  const run = (made: RunIo, targets: Target[], limit?: number) =>
    runScorecard(targets, made, new AbortController().signal, () => {}, limit);

  it("gives each picture once after one pass that is not kept, in pixels", async () => {
    const { made, log, seen } = io(),
      result = await run(made, [lite0Cpu]);
    expect(seen).toEqual(["1.jpg", "1.jpg", "2.jpg", "3.jpg"]);
    expect(result.runs[0].pictures).toHaveLength(3);
    expect(result.runs[0].pictures[0].boxes[0].box).toEqual({
      x: 20,
      y: 20,
      w: 60,
      h: 40,
    });
    expect(result.runs[0]).toMatchObject({ status: "ok", sha256: "abc" });
    expect(log).toEqual([
      "paused true",
      `ready ${lite0Cpu.id}`,
      `close ${lite0Cpu.id}`,
      "paused false",
    ]);
  });
  it("takes the first few pictures in a shortened run", async () => {
    const { made } = io();
    expect((await run(made, [lite0Cpu], 2)).items.map((i) => i.id)).toEqual([
      1, 2,
    ]);
  });
  it("records a failed start as a failed row and opens no other worker", async () => {
    const opened: string[] = [];
    const { made, log } = io({
      open: (target) => {
        opened.push(`${target.model}:${target.delegate}`);
        return {
          ready: async () => {
            throw new Error("Vision model failed: no GPU here");
          },
          detect: async () => ({ latency: 0, boxes: [] }),
          close: () => {},
        };
      },
    });
    const gpu = { ...lite0Cpu, id: "x:GPU", delegate: "GPU" as const },
      result = await run(made, [gpu]);
    expect(result.runs).toEqual([
      {
        target: gpu,
        status: "failed",
        note: "no GPU here",
        sha256: null,
        pictures: [],
      },
    ]);
    expect(opened).toEqual([`${LITE0}:GPU`]);
    expect(log.at(-1)).toBe("paused false");
  });
  it("does not start a target the device refuses, and leaves a paused stage paused", async () => {
    const opened: Target[] = [],
      { made, log } = io({
        refused: () => "GPU not available: software WebGL",
        paused: () => true,
        open: (target) => {
          opened.push(target);
          throw new Error("opened");
        },
      });
    const result = await run(made, [sharper]);
    expect(result.runs[0].note).toBe("GPU not available: software WebGL");
    expect(opened).toEqual([]);
    expect(log).toEqual(["paused true", "paused true"]);
  });
  it("drops the unfinished run when stopped and closes its worker", async () => {
    const control = new AbortController(),
      { made, log } = io({
        fetchPicture: async (picture) => {
          if (picture.id === 2) control.abort();
          return new Blob();
        },
      });
    made.open = (target) => ({
      ready: async () => {},
      detect: async () => {
        if (control.signal.aborted) throw new Error("stopped");
        return { latency: 1, boxes: [] };
      },
      close: () => void log.push(`close ${target.id}`),
    });
    const result = await runScorecard(
      [lite0Cpu, lite0Cpu],
      made,
      control.signal,
      () => {},
    );
    expect(result).toMatchObject({ runs: [], stopped: true });
    expect(
      log.filter((line) => line.startsWith("close")).length,
    ).toBeGreaterThan(0);
    expect(log.at(-1)).toBe("paused false");
  });
});
