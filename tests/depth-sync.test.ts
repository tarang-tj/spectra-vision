/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, expect, it } from "vitest";
import { contentOf, extremes } from "../src/modes/lib/depth-map";
import { depthExtra } from "../src/modes/lib/depth-readout";
import {
  depthSync,
  FRESH_MS,
  isMoving,
  lagLine,
} from "../src/modes/lib/depth-sync";
import { unprojectRelief } from "../src/vision/depth/unproject";
import { createFrameHolder, MAX_SIDE } from "../src/vision/held-frame";
import type { DepthExtra, TaskResult } from "../src/vision/types";

const image = { name: "held" } as unknown as CanvasImageSource;

describe("which picture a depth map is drawn over", () => {
  it("a still: the live picture, whatever the map's age", () => {
    const sync = depthSync({ time: 0 }, { time: 90_000, paused: false }, false);
    expect(sync).toEqual({ over: "live" });
    expect(lagLine(sync)).toBe("");
  });
  it("a moving picture: the frame the map was made from, with how far behind it is", () => {
    // Read at 1,000 ms, drawn at 1,640 ms: 0.6 s behind, to a tenth.
    const sync = depthSync(
      { time: 1000, frame: { image, capturedAt: 1000 } },
      { time: 1640, paused: false },
      true,
    );
    expect(sync.over).toBe("held");
    if (sync.over !== "held") return;
    expect(sync.image).toBe(image);
    expect(sync.lag).toMatchObject({ value: 0.6, error: 0.1, unit: "s" });
    expect(sync.lag!.basis).toMatch(/read from the video/);
    expect(lagLine(sync)).toBe("Picture and map: 0.60 ± 0.10 s behind live.");
  });
  it("a moving picture with no frame held: an old map is not drawn, and the legend says so", () => {
    const old = depthSync({ time: 1000 }, { time: 1930, paused: false }, true);
    expect(old.over).toBe("nothing");
    expect(lagLine(old)).toBe(
      "Map not drawn: it is 0.90 ± 0.10 s old and the picture has moved on.",
    );
    // At the tolerance the map still belongs to the picture; just past it, not.
    expect(
      depthSync({ time: 1000 }, { time: 1000 + FRESH_MS, paused: false }, true)
        .over,
    ).toBe("live");
    expect(
      depthSync({ time: 1000 }, { time: 1001 + FRESH_MS, paused: false }, true)
        .over,
    ).toBe("nothing");
  });
  it("paused: the held frame stays, and no age is claimed while time stands still", () => {
    const sync = depthSync(
      { time: 1000, frame: { image, capturedAt: 1000 } },
      { time: 60_000, paused: true },
      true,
    );
    expect(sync).toEqual({ over: "held", image, lag: null });
    expect(lagLine(sync)).toBe("Paused on the frame the map was made from.");
  });
  it("tells a video element from an image", () => {
    const of = (element: object) => isMoving({ source: { element } as never });
    expect(of({ videoWidth: 640 })).toBe(true);
    expect(of({ naturalWidth: 640 })).toBe(false);
    expect(isMoving({ source: null })).toBe(false);
  });
});

describe("the frame holder", () => {
  // A stand-in canvas that records what was drawn into it.
  const surfaces: { width: number; height: number; drawn: unknown[] }[] = [];
  const holder = () =>
    createFrameHolder(() => {
      const surface = {
        width: 0,
        height: 0,
        drawn: [] as unknown[],
        getContext: () => ({
          drawImage: (frame: unknown) => void surface.drawn.push(frame),
        }),
      };
      surfaces.push(surface);
      return surface as never;
    });
  const bitmap = (name: string, width = 640, height = 480) =>
    ({ name, width, height }) as never;

  it("hands each result the frame it was computed from, on two canvases in turn", () => {
    surfaces.length = 0;
    const h = holder();
    expect(h.commit()).toBeNull();
    h.capture(bitmap("a"), 10);
    const a = h.commit()!;
    expect(a.capturedAt).toBe(10);
    h.capture(bitmap("b"), 20);
    // Until b's result arrives, a's picture is untouched.
    expect((a.image as never as { drawn: unknown[] }).drawn).toHaveLength(1);
    const b = h.commit()!;
    expect(b.capturedAt).toBe(20);
    expect(b.image).not.toBe(a.image);
    h.capture(bitmap("c"), 30);
    const c = h.commit()!;
    // c reuses a's canvas; b's, the one before it, is still whole.
    expect(c.image).toBe(a.image);
    expect((b.image as never as { drawn: unknown[] }).drawn).toHaveLength(1);
    expect(surfaces).toHaveLength(2);
    expect(h.commit()).toBeNull();
  });
  it("a frame that gets no result is not handed to the next one", () => {
    surfaces.length = 0;
    const h = holder();
    h.capture(bitmap("lost"), 10);
    h.drop();
    expect(h.commit()).toBeNull();
    h.capture(bitmap("next"), 20);
    expect(h.commit()!.capturedAt).toBe(20);
    expect(surfaces).toHaveLength(1);
  });
  it("keeps the copy to a bounded size", () => {
    surfaces.length = 0;
    const h = holder();
    h.capture(bitmap("4k", 3840, 2160), 1);
    expect(surfaces[0]).toMatchObject({ width: MAX_SIDE, height: 720 });
  });
});

describe("a map with bars", () => {
  // 6 x 4, bars in columns 0 and 5 that the model calls very near (9); the
  // picture is columns 1..4 with values 1..4 along each row.
  const values = Float32Array.from({ length: 24 }, (_, i) =>
      i % 6 === 0 || i % 6 === 5 ? 9 : i % 6,
    ),
    extra: DepthExtra = {
      width: 6,
      height: 4,
      values,
      min: 1,
      max: 4,
      content: { x: 1, y: 0, width: 4, height: 4 },
    };
  it("the nearest and farthest points are looked for in the picture only", () => {
    const ends = extremes(extra);
    // Nearest is a 4 (column 4), not a bar's 9; farthest a 1 (column 1).
    expect(ends.near.x).toBeCloseTo(4.5 / 6, 6);
    expect(ends.far.x).toBeCloseTo(1.5 / 6, 6);
    expect(contentOf(extra)).toEqual(extra.content);
    expect(contentOf({ ...extra, content: undefined })).toEqual({
      x: 0,
      y: 0,
      width: 6,
      height: 4,
    });
  });
  it("the 3D relief has no points for the bars", () => {
    const cloud = unprojectRelief(values, 6, 4, 1, 4, extra.content);
    expect(cloud.count).toBe(16);
    expect([...cloud.cells].every((cell) => values[cell] !== 9)).toBe(true);
    expect(unprojectRelief(values, 6, 4, 1, 4).count).toBe(24);
  });
  it("a picture rectangle that does not fit the map is not believed", () => {
    const result = (content: unknown) =>
      ({
        kind: "depth",
        extra: { width: 6, height: 4, values, min: 1, max: 4, content },
      }) as unknown as TaskResult;
    expect(
      depthExtra(result({ x: 1, y: 0, width: 4, height: 4 }))!.content,
    ).toEqual({ x: 1, y: 0, width: 4, height: 4 });
    for (const bad of [
      { x: 3, y: 0, width: 4, height: 4 },
      { x: -1, y: 0, width: 4, height: 4 },
      { x: 0.5, y: 0, width: 4, height: 4 },
      { x: 0, y: 0, width: 0, height: 4 },
      "everything",
    ])
      expect(depthExtra(result(bad))!.content, JSON.stringify(bad)).toBe(
        undefined,
      );
  });
});
