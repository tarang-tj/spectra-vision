/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import objects, { LOOKING } from "../src/modes/objects";
import { forgetDrawn } from "../src/modes/lib/object-boxes";
import ObjectModelSetting from "../src/modes/lib/object-model-setting";
import { StudioContext } from "../src/studio-context";
import type { Studio } from "../src/studio-context";
import {
  refuseGpuModel,
  resetModelChoice,
  setLargerOnGpu,
} from "../src/vision/model-choice";
import { tasksOf } from "../src/modes/types";
import { beginStatus } from "../src/telemetry/task-status";
import { createFrame, updateFrame } from "../src/vision/frame";
import type { FrameData } from "../src/vision/frame";
import { setSmoothing } from "../src/vision/settings";
import type { Source, Track, VisionResult } from "../src/vision/types";

// Objects drawn on a canvas that only keeps a record: every rectangle
// stroked and every text filled, with the alpha and dash in force.
type Mark = { alpha: number; dashed: boolean };
function recorder() {
  const boxes: (Mark & { x: number; y: number; w: number; h: number })[] = [],
    texts: (Mark & { text: string })[] = [];
  let dash: number[] = [];
  const saved: { alpha: number; dash: number[] }[] = [],
    ctx = {
      globalAlpha: 1,
      save() {
        saved.push({ alpha: ctx.globalAlpha, dash });
      },
      restore() {
        const old = saved.pop()!;
        ctx.globalAlpha = old.alpha;
        dash = old.dash;
      },
      setLineDash(next: number[]) {
        dash = next;
      },
      strokeRect(x: number, y: number, w: number, h: number) {
        boxes.push({
          x,
          y,
          w,
          h,
          alpha: ctx.globalAlpha,
          dashed: !!dash.length,
        });
      },
      fillText(text: string) {
        texts.push({ text, alpha: ctx.globalAlpha, dashed: !!dash.length });
      },
      measureText: (text: string) => ({ width: text.length * 6 }),
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      fillRect() {},
    };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, boxes, texts };
}
const track = (id: number, x: number, more: Partial<Track> = {}): Track => ({
  id,
  label: "vase",
  score: 0.52,
  box: { x, y: 0.25, w: 0.125, h: 0.25 },
  lastSeen: 0,
  trail: [],
  ...more,
});
const result = (time: number, generation = 1): VisionResult => ({
  mode: "objects",
  generation,
  time,
  latency: 1,
  detections: [],
  landmarks: [],
  handedness: [],
  tasks: {},
});
const camera = { kind: "camera", generation: 1 } as Source;
// A 1280 x 720 source on a canvas of the same size: one image fraction of
// 1/1280 is one pixel across.
function frameOf(data: Partial<FrameData>, paused = false) {
  const frame = createFrame();
  updateFrame(
    frame,
    {
      result: null,
      tracks: [],
      mirror: false,
      settings: { confidence: 0.45, selected: null, effects: {} },
      source: null,
      aspect: 16 / 9,
      ...data,
    },
    1280,
    720,
    1280,
    720,
    1,
    0,
    0,
    paused,
    true,
  );
  return frame;
}
const draw = (data: Partial<FrameData>, paused = false) => {
  const canvas = recorder();
  objects.drawBase(canvas.ctx, frameOf(data, paused));
  return canvas;
};

beforeEach(() => {
  setSmoothing(true);
  forgetDrawn();
});
afterEach(() => setSmoothing(true));

describe("Objects: a held track", () => {
  it("is drawn dimmed and dashed, and its label says held in place of a score", () => {
    const { boxes, texts } = draw({
      result: result(0),
      tracks: [track(1, 0.1), track(2, 0.6, { held: true })],
    });
    expect(boxes.map((b) => [b.alpha, b.dashed])).toEqual([
      [0.55, false],
      [0.55 * 0.45, true],
    ]);
    expect(texts.map((t) => t.text)).toEqual([
      "vase  52% · 01",
      "vase  held · 02",
    ]);
    expect(texts[1].alpha).toBeCloseTo(0.45, 9);
  });
  it("leaves the next box solid: the dash does not leak", () => {
    const { boxes } = draw({
      result: result(0),
      tracks: [track(1, 0.1, { held: true }), track(2, 0.6)],
    });
    expect(boxes.map((b) => b.dashed)).toEqual([true, false]);
  });
  it("is listed as held, without a score", () => {
    const rows = objects.inspector({
      ...frameOf({}),
      tracks: [
        track(1, 0.1),
        track(2, 0.6, {
          held: true,
          finer: { label: "jug", score: 0.41 },
        }),
      ],
    });
    expect(rows.map((r) => r.detail)).toEqual(["52%", "held · jug 41%"]);
  });
});

describe("Objects: smoothing of the drawn boxes", () => {
  const steps = () => {
    const xs: number[] = [],
      raw: number[] = [];
    // A still box that the detector reports 3 px either side of its place.
    for (let i = 0; i < 40; i++) {
      const x = 0.4 + (i % 2 ? 3 : -3) / 1280,
        tracks = [track(1, x)],
        { boxes } = draw({ result: result(i * 66), tracks });
      xs.push(boxes[0].x);
      raw.push(tracks[0].box.x * 1280);
    }
    const swing = (a: number[]) =>
      Math.max(...a.slice(10)) - Math.min(...a.slice(10));
    return { drawn: swing(xs), raw: swing(raw) };
  };
  it("steadies what is drawn and leaves the tracks as they were", () => {
    const { drawn, raw } = steps();
    expect(raw).toBeCloseTo(6, 6);
    expect(drawn).toBeLessThan(raw / 2);
  });
  it("draws the raw boxes while Smooth is off", () => {
    setSmoothing(false);
    const { drawn, raw } = steps();
    expect(drawn).toBeCloseTo(raw, 6);
  });
  it("filters once per result, not once per drawn frame", () => {
    const tracks = [track(1, 0.4)],
      first = result(0);
    draw({ result: first, tracks });
    const moved = [track(1, 0.5)],
      next = result(66),
      once = draw({ result: next, tracks: moved }).boxes[0].x;
    // The same result drawn thirty more times stays where it was.
    for (let i = 0; i < 30; i++)
      expect(draw({ result: next, tracks: moved }).boxes[0].x).toBe(once);
  });
  it("starts again on a new source, where ids start again", () => {
    draw({ result: result(0), tracks: [track(1, 0.1)] });
    draw({ result: result(66), tracks: [track(1, 0.1)] });
    const { boxes } = draw({
      result: result(132, 2),
      tracks: [track(1, 0.7)],
    });
    expect(boxes[0].x).toBeCloseTo(0.7 * 1280, 6);
  });
  it("forgets its filters when the mode is left", () => {
    draw({ result: result(0), tracks: [track(1, 0.1)] });
    objects.leave!();
    const { boxes } = draw({ result: result(66), tracks: [track(1, 0.7)] });
    expect(boxes[0].x).toBeCloseTo(0.7 * 1280, 6);
  });
});

describe("Objects: before the first result of a moving source", () => {
  const spec = tasksOf(objects)[0],
    said = (data: Partial<FrameData>, paused = false) =>
      draw(data, paused).texts.map((t) => t.text);
  it("says it is looking once the model is loaded, and stops at the first result", () => {
    const status = beginStatus("object", spec.model, "CPU", "CPU", "");
    // Still loading: the stage's own loading line is showing.
    expect(said({ source: camera })).toEqual([]);
    status.state = "ready";
    expect(said({ source: camera })).toEqual([LOOKING]);
    expect(said({ source: { ...camera, kind: "video" } })).toEqual([LOOKING]);
    expect(said({ source: camera, result: result(0) })).toEqual([]);
  });
  it("says nothing while paused, on a still picture or with no source", () => {
    beginStatus("object", spec.model, "CPU", "CPU", "").state = "ready";
    expect(said({ source: camera }, true)).toEqual([]);
    expect(said({ source: { ...camera, kind: "image" } })).toEqual([]);
    expect(said({ source: { ...camera, kind: "demo" } })).toEqual([]);
    expect(said({})).toEqual([]);
  });
});

describe("Objects: the switch for the larger model", () => {
  const spec = tasksOf(objects)[0],
    text = (task?: { model: string; delegate: string }) =>
      renderToStaticMarkup(
        createElement(
          StudioContext.Provider,
          {
            value: {
              frame: { result: task ? { tasks: { object: task } } : null },
            } as unknown as Studio,
          },
          createElement(ObjectModelSetting, { spec }),
        ),
      ).replace(/<!-- -->/g, "");
  afterEach(resetModelChoice);
  it("is on by default and states both sizes from the task", () => {
    resetModelChoice();
    const html = text();
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain(
      "On Fast, Objects uses the 12 MB model where it runs on a real graphics processor and the 7 MB one on CPU.",
    );
    expect(html).not.toContain("Running now");
  });
  it("says what the latest result really ran on", () => {
    expect(
      text({ model: "efficientdet_lite2.tflite", delegate: "GPU" }),
    ).toContain("Running now: the 12 MB model on GPU.");
    expect(
      text({ model: "efficientdet_lite0.tflite", delegate: "CPU" }),
    ).toContain("Running now: the 7 MB model on CPU.");
  });
  it("says why the larger model was given up, and how to try again", () => {
    refuseGpuModel("object", "it took 200 ms a frame here");
    expect(text()).toContain(
      "The larger model was given up on this page: it took 200 ms a frame here. Switch this off and on to try it again.",
    );
    setLargerOnGpu(false);
    const off = text();
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain("given up");
  });
});
