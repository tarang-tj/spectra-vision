/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getBox,
  resetBox,
  setBox,
  setSize,
} from "../src/panels/ruler/fit/box-state";
import { seededRandom } from "../src/panels/ruler/monte-carlo";
import { allPlumbs } from "../src/panels/ruler/plumbs";
import {
  addView,
  adoptView,
  getViews,
  removeView,
  resetViews,
  showView,
  takeSnap,
  viewOf,
  type Load,
  type ViewSnap,
} from "../src/panels/ruler/room/views-store";
import {
  addReference,
  bindSource,
  getState,
  place,
  resetRuler,
  setCustom,
  setRef,
  setTape,
  setTool,
  toggleSwap,
} from "../src/panels/ruler/store";
import {
  addCorner,
  closeRoom,
  getWalls,
  setTop,
} from "../src/panels/ruler/walls/store";

const W = 1600,
  H = 1200,
  png = (name: string) => new Blob([name], { type: "image/png" });
let generation = 0;
/** The stage as the views store sees it: a picture goes up as a new
 * generation and the Ruler's overlay binds to it on the next drawn frame.
 * `first` chooses which of the two happens first; both orders occur. */
const stage =
  (first: "frame" | "restore"): Load =>
  async () => {
    const mine = ++generation;
    if (first === "frame") bindSource(mine, W, H, 1);
    else queueMicrotask(() => bindSource(mine, W, H, 1));
    return mine;
  };
const sheet = (dx: number) =>
  [
    { x: 400 + dx, y: 500 },
    { x: 800 + dx, y: 510 },
    { x: 820 + dx, y: 800 },
    { x: 380 + dx, y: 790 },
  ].forEach((p) => place(p, 1.5));

beforeEach(() => {
  resetViews();
  resetRuler();
  resetBox();
  generation = 0;
});

describe.each(["frame", "restore"] as const)(
  "views, when the %s comes first",
  (first) => {
    const load = stage(first);

    it("keeps each picture's own reference, span, known sizes, box and walls across switches", async () => {
      setRef("custom");
      setCustom("1000", "700");
      const a = (await addView(png("a"), "a.png", load))!;
      sheet(0);
      place({ x: 100, y: 900 }, 1.5);
      place({ x: 300, y: 950 }, 1.5);
      setTape(0, "25");
      setBox({ at: { x: 500, y: 400 }, rot: 30 }, "drag");
      const inA = takeSnap();

      const b = (await addView(png("b"), "b.png", load))!;
      // A new picture of the same room starts with nothing tapped, the same
      // reference chosen, and the typed box sizes.
      expect(getState().corners).toEqual([]);
      expect(getState().measures).toEqual([]);
      expect(getState().refId).toBe("custom");
      expect(getState().customA).toBe("1000");
      expect(getBox().at).toBeNull();
      sheet(200);
      toggleSwap();
      setTool("wall");
      for (const p of [
        { x: 100, y: 1000 },
        { x: 1500, y: 1000 },
        { x: 1300, y: 400 },
      ])
        addCorner(p);
      closeRoom();
      setTop(0, { x: 100, y: 200 });
      const inB = takeSnap();
      expect(allPlumbs()).toHaveLength(1);

      expect(await showView(a, load)).toBe(true);
      expect(getViews().current).toBe(a);
      expect(takeSnap()).toEqual(inA);
      expect(getState().generation).toBe(viewOf(a)!.generation);
      expect(getState().measures[0].tape).toBe("25");
      expect(getWalls().corners).toHaveLength(0);
      expect(allPlumbs()).toHaveLength(0);
      // The tool in use carries over when the picture has its reference.
      expect(getState().tool).toBe("wall");

      expect(await showView(b, load)).toBe(true);
      expect(takeSnap()).toEqual(inB);
      expect(getState().swap).toBe(true);
      expect(getWalls().corners[0].top).toEqual({ x: 100, y: 200 });
      expect(allPlumbs()).toHaveLength(1);
      expect(getBox().at).toBeNull();
      // What is done on the stage's picture is saved as it is done.
      setSize("w", 1234);
      expect(viewOf(b)!.snap.box.w).toBe(1234);
      expect(viewOf(a)!.snap).toEqual(inA);
    });

    it("lets go of the stage when another picture is uploaded, and keeps what was tapped", async () => {
      const a = (await addView(png("a"), "a.png", load))!;
      sheet(0);
      const inA = viewOf(a)!.snap;
      expect(inA.ruler.corners).toHaveLength(4);
      // An upload from the header: a generation the room does not know.
      bindSource(++generation, W, H, 1);
      expect(getViews().current).toBeNull();
      expect(getState().corners).toEqual([]);
      expect(viewOf(a)!.snap).toBe(inA);
      await showView(a, load);
      expect(getState().corners).toHaveLength(4);
    });

    it("adopts the picture on the stage with its taps, and removes views", async () => {
      bindSource(++generation, W, H, 1);
      sheet(0);
      const a = adoptView(png("a"), "a.png", generation);
      expect(getViews().current).toBe(a);
      expect(viewOf(a)!.snap.ruler.corners).toHaveLength(4);
      const b = (await addView(png("b"), "b.png", load))!;
      sheet(50);
      await removeView(b, load);
      // The nearest other picture takes the stage, with its own taps.
      expect(getViews().views.map((v) => v.id)).toEqual([a]);
      expect(getViews().current).toBe(a);
      expect(getState().corners[0]).toEqual({ x: 400, y: 500, s: 1.5 });
      await removeView(a, load);
      expect(getViews().views).toEqual([]);
      expect(getViews().current).toBeNull();
    });

    it("does not keep a picture that cannot be opened, and says so", async () => {
      const a = (await addView(png("a"), "a.png", load))!;
      sheet(0);
      const bad: Load = () => Promise.reject(new Error("no"));
      expect(await addView(png("x"), "x.png", bad)).toBeNull();
      expect(getViews().views.map((v) => v.id)).toEqual([a]);
      expect(getViews().problem).toMatch(/could not be opened/);
      expect(getViews().busy).toBe(false);
      expect(viewOf(a)!.snap.ruler.corners).toHaveLength(4);
    });

    it("round-trips 150 random states through leaving and entering a view", async () => {
      const r = seededRandom(first === "frame" ? 11 : 12),
        int = (n: number) => Math.floor(r() * n),
        pt = () => ({ x: r() * W, y: r() * H, s: 0.5 + r() * 3 }),
        pts = (n: number) => Array.from({ length: n }, pt),
        random = (): ViewSnap => ({
          ruler: {
            refId: ["letter", "a4", "card", "custom"][int(4)],
            customA: String(100 + int(900)),
            customB: String(100 + int(900)),
            corners: pts(int(5)),
            swap: r() < 0.5,
            measures: Array.from({ length: int(4) }, () => ({
              a: pt(),
              b: r() < 0.8 ? pt() : null,
              ...(r() < 0.5
                ? { tape: String(int(900)), tapeUnit: "cm", known: r() < 0.5 }
                : {}),
            })),
            shapes: Array.from({ length: int(3) }, () => ({
              kind: (["path", "area", "edge"] as const)[int(3)],
              pts: pts(3 + int(4)),
              done: r() < 0.8,
            })),
            lensOn: r() < 0.5,
            source: { w: W, h: H },
            scale: 0.25 + r(),
          },
          known: {
            extraRefs: Array.from({ length: int(3) }, () => ({
              label: "A4",
              long: 297,
              short: 210,
              corners: pts(int(5)),
            })),
            tapeSd: String(1 + int(9)),
          },
          box: {
            w: 100 + int(3000),
            d: 100 + int(3000),
            h: 100 + int(3000),
            at: r() < 0.7 ? { x: r() * 4000, y: r() * 3000 } : null,
            rot: r() * 360 - 180,
          },
          walls: (() => {
            const corners = Array.from({ length: int(6) }, () => ({
                base: pt(),
                top: r() < 0.5 ? pt() : null,
              })),
              closed = corners.length >= 3 && r() < 0.7;
            return {
              corners: closed
                ? corners
                : corners.map((c) => ({ ...c, top: null })),
              closed,
              pick: closed && r() < 0.5 ? int(corners.length) : null,
            };
          })(),
        });
      const ids: number[] = [],
        want = new Map<number, ViewSnap>();
      for (let i = 0; i < 3; i++) {
        const snap = random(),
          id = (await addView(png(`${i}`), `${i}.png`, load, snap))!;
        ids.push(id);
        want.set(id, snap);
        expect(takeSnap()).toEqual(snap);
      }
      for (let i = 0; i < 150; i++) {
        const id = ids[int(3)];
        await showView(id, load);
        expect(takeSnap(), `visit ${i}`).toEqual(want.get(id));
        const tops = want.get(id)!.walls.corners.filter((c) => c.top).length;
        expect(allPlumbs(), `plumbs on visit ${i}`).toHaveLength(tops);
        // Every other visit, replace the view's state while it is shown.
        if (i % 2) {
          const snap = random();
          const again = (await addView(png("n"), "n.png", load, snap))!;
          await removeView(id, load);
          ids[ids.indexOf(id)] = again;
          want.delete(id);
          want.set(again, snap);
        }
      }
      for (const id of ids) expect(viewOf(id)!.snap).toEqual(want.get(id));
    });
  },
);

it("cannot take a further reference along by accident: each picture has its own", async () => {
  const load = stage("frame");
  const a = (await addView(png("a"), "a.png", load))!;
  sheet(0);
  addReference({ id: "a4", label: "A4", long: 297, short: 210 });
  place({ x: 1000, y: 900 }, 1.5);
  expect(getState().extraRefs[0].corners).toHaveLength(1);
  const b = (await addView(png("b"), "b.png", load))!;
  expect(getState().extraRefs).toEqual([]);
  await showView(a, load);
  expect(getState().extraRefs[0].corners).toHaveLength(1);
  await showView(b, load);
  expect(getState().extraRefs).toEqual([]);
});
