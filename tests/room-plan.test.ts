/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import { fitBox, type Raster } from "../src/panels/ruler/topdown";
import { ROOM_CSV_HEADER, roomCsv } from "../src/panels/ruler/room/room-export";
import {
  mergeTopDown,
  toRoomMap,
  type Layer,
} from "../src/panels/ruler/room/room-plan";
import {
  layoutExtras,
  planLayers,
} from "../src/panels/ruler/room/room-plan-draw";
import { roomScene } from "../src/panels/ruler/room/room-scene";
import { solveRoom, toOwn } from "../src/panels/ruler/room/room-solve";
import { dropFrames, stateOf } from "../src/panels/ruler/room/view-frame";
import type { View, ViewSnap } from "../src/panels/ruler/room/views-store";
import {
  boardCorners,
  cameraFor,
  CORNERS,
  fromBoardFrame,
  inBoardFrame,
  MARKS,
  ROOM,
  type P,
} from "./fixtures/room-scene";
import { baseCorner, H, roomOf, snapOf, tapOn, W } from "./helpers/room-build";

beforeEach(() => dropFrames());

/** The floor's four quarters, each its own colour; off the floor is grey. */
const QUARTERS = [
  [200, 40, 40],
  [40, 200, 40],
  [40, 40, 200],
  [220, 220, 40],
];
const quarter = (p: P): number | null =>
  p.x < 0 || p.y < 0 || p.x > ROOM.w || p.y > ROOM.d
    ? null
    : (p.x < ROOM.w / 2 ? 0 : 1) + (p.y < ROOM.d / 2 ? 0 : 2);
/** Camera `cam`'s picture of the coloured floor, a quarter of full size, by
 * the fixture's own ray through each pixel. */
function photo(cam: number, scale = 0.25): { raster: Raster; scale: number } {
  const c = cameraFor(cam, W, H),
    w = W * scale,
    h = H * scale,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const at = c.floorAt({ x: (x + 0.5) / scale, y: (y + 0.5) / scale }),
        q = at ? quarter(at) : null,
        rgb = q === null ? [90, 90, 90] : QUARTERS[q];
      data.set([...rgb, 255], (y * w + x) * 4);
    }
  return { raster: { data, w, h }, scale };
}
const mark = (
  id: number,
  p: P,
  cams: number[],
  views = cams.map((_, i) => i + 1),
) => ({
  id,
  seen: cams.map((cam, i) => ({ view: views[i], at: tapOn(cam, p) })),
});
const asViews = (snaps: ViewSnap[]): View[] =>
  snaps.map((snap, i) => ({
    id: i + 1,
    label: `cam-${i}.png`,
    blob: null,
    thumb: null,
    snap,
    generation: null,
  }));

describe("the merged top-down view", () => {
  const snaps = [0, 1, 2, 3].map((cam) => snapOf({ cam })),
    layersOf = (sol: ReturnType<typeof solveRoom>, cams = [0, 1, 2, 3]) =>
      sol.views.flatMap((v, i): (Layer & { cam: number })[] =>
        v.rigid
          ? [
              {
                ...photo(cams[i]),
                h: toRoomMap(v.rigid, derive(stateOf(snaps[i])).sheet!.h),
                lens: null,
                cam: cams[i],
              },
            ]
          : [],
      );

  it("puts every painted pixel on the right quarter of the floor, from four pictures at three different turns", () => {
    const room = roomOf(snaps, [mark(1, MARKS[0], [0, 1, 2, 3])]),
      sol = solveRoom(room),
      k = baseCorner(room, 0),
      corners = CORNERS.map((c) => inBoardFrame(c, k)),
      fit = fitBox({
        x0: Math.min(...corners.map((c) => c.x)),
        y0: Math.min(...corners.map((c) => c.y)),
        x1: Math.max(...corners.map((c) => c.x)),
        y1: Math.max(...corners.map((c) => c.y)),
      }),
      layers = layersOf(sol),
      { image, from } = mergeTopDown(layers, fit);
    expect(layers).toHaveLength(4);
    let painted = 0,
      wrong = 0,
      floor = 0;
    const used = new Set<number>();
    for (let v = 0; v < fit.height; v++)
      for (let u = 0; u < fit.width; u++) {
        const world = fromBoardFrame(
            {
              x: fit.box.x0 + (u + 0.5) / fit.ppm,
              y: fit.box.y0 + (v + 0.5) / fit.ppm,
            },
            k,
          ),
          q = quarter(world),
          // A source pixel is 30 mm of floor or more: skip the seams.
          seam =
            Math.min(
              Math.abs(world.x - ROOM.w / 2),
              Math.abs(world.y - ROOM.d / 2),
              Math.abs(world.x),
              Math.abs(world.y),
              Math.abs(world.x - ROOM.w),
              Math.abs(world.y - ROOM.d),
            ) < 120;
        if (q !== null && !seam) floor++;
        if (!from[v * fit.width + u] || q === null || seam) continue;
        painted++;
        used.add(from[v * fit.width + u]);
        const o = (v * fit.width + u) * 4;
        if (QUARTERS[q].some((c, i) => image.data[o + i] !== c)) wrong++;
      }
    expect(wrong).toBe(0);
    // Most of the floor is shown by some picture, and every picture is used.
    expect(painted / floor).toBeGreaterThan(0.6);
    expect([...used].sort()).toEqual([1, 2, 3, 4]);
  });

  it("uses the nearer camera where two pictures show the same floor", () => {
    // Cameras 0 and 2 face each other across the room.
    const two = [snaps[0], snaps[2]],
      room = roomOf(two, [mark(1, MARKS[0], [0, 2])]),
      sol = solveRoom(room),
      k = baseCorner(room, 0),
      fit = fitBox({ x0: -2000, y0: -2000, x1: 3000, y1: 2500 }),
      layers = sol.views.map((v, i) => ({
        ...photo([0, 2][i]),
        h: toRoomMap(v.rigid!, derive(stateOf(two[i])).sheet!.h),
        lens: null,
      })),
      { from } = mergeTopDown(layers, fit),
      winner = (world: P) => {
        const p = inBoardFrame(world, k),
          u = Math.floor((p.x - fit.box.x0) * fit.ppm),
          v = Math.floor((p.y - fit.box.y0) * fit.ppm);
        return from[v * fit.width + u];
      };
    // Camera 0 stands at y = 150, camera 2 at y = 2950.
    expect(winner({ x: 2100, y: 1100 })).toBe(1);
    expect(winner({ x: 2100, y: 2000 })).toBe(2);
    expect(winner({ x: 1200, y: 1200 })).toBe(1);
    expect(winner({ x: 3000, y: 1900 })).toBe(2);
  });

  it("draws nothing from a picture with no anchor, or from one that was refused", () => {
    // Picture 3 has no anchor; picture 4's sheet moved 50 mm.
    const moved = [
        snaps[0],
        snaps[1],
        snaps[2],
        snapOf({ cam: 3, shift: { x: 50, y: 0 } }),
      ],
      room = roomOf(moved, [
        mark(1, MARKS[0], [0, 1, 3], [1, 2, 4]),
        { id: 2, seen: [{ view: 3, at: tapOn(2, CORNERS[0]) }] },
      ]),
      sol = solveRoom(room);
    expect(sol.views.map((v) => v.state)).toEqual([
      "first",
      "placed",
      "unanchored",
      "refused",
    ]);
    const scene = roomScene(
      asViews(moved),
      sol,
      {
        points: room.points,
        outline: [],
        closed: false,
        next: { kind: "corner" },
        nextId: 9,
      },
      "m",
      "basis",
    )!;
    expect(scene.placed).toEqual([1, 2]);
    // All four have pixels at hand; only the two on the plan are laid down.
    const layers = planLayers(asViews(moved), sol, (v) => photo(v.id - 1));
    expect(layers).toHaveLength(2);
    const { from } = mergeTopDown(
      layers,
      fitBox({ x0: -2500, y0: -2500, x1: 3500, y1: 3000 }),
    );
    expect(new Set(from)).toEqual(new Set([0, 1, 2]));
    // The room point only picture 3 shows has no place on the plan.
    expect(sol.points[1].sample).toBeNull();
    expect(
      scene.extras.filter((e) => e.kind === "dot" && e.label.startsWith("R")),
    ).toHaveLength(1);
  });
});

describe("the room plan's contents", () => {
  it("lays a later picture's span, box and Walls outline in the room's frame, and names the room's numbers", () => {
    const first = snapOf({ cam: 0 }),
      plain = snapOf({ cam: 2 }),
      // In picture 2: a span between the two marks, a box, three wall corners.
      second: ViewSnap = {
        ...plain,
        ruler: {
          ...plain.ruler,
          measures: [{ a: tapOn(2, MARKS[0]), b: tapOn(2, MARKS[1]) }],
        },
        walls: {
          corners: [
            { base: tapOn(2, CORNERS[0]), top: { x: 100, y: 50 } },
            { base: tapOn(2, CORNERS[1]), top: null },
            { base: tapOn(2, { x: 2100, y: 1500 }), top: null },
          ],
          closed: true,
          pick: null,
        },
      },
      snaps = [first, second],
      // Where picture 2's own frame has the point (1000, 600), for the box.
      probe = { x: 3000, y: 900 },
      corners = [CORNERS[2], CORNERS[3], CORNERS[0], CORNERS[1]],
      points = [
        mark(1, MARKS[0], [0, 2]),
        ...corners.map((c, i) => ({
          id: i + 2,
          seen: [{ view: i < 2 ? 1 : 2, at: tapOn(i < 2 ? 0 : 2, c) }],
        })),
      ],
      room = roomOf(snaps, points, [2, 3, 4, 5], true),
      sol = solveRoom(room),
      k = baseCorner(room, 0),
      rigid = sol.views[1].rigid!,
      truth = (p: P) => inBoardFrame(p, k);
    // Put the box where picture 2's own frame has the probe.
    second.box = { ...second.box, at: toOwn(rigid, truth(probe)), rot: 0 };
    const scene = roomScene(
        asViews(snaps),
        sol,
        {
          points: room.points,
          outline: [2, 3, 4, 5],
          closed: true,
          next: { kind: "mark" },
          nextId: 9,
        },
        "m",
        "the basis",
      )!,
      near = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
    expect(scene.placed).toEqual([1, 2]);
    expect(scene.scene.basis).toBe("the basis");
    // One reference outline, from the first picture.
    expect(
      scene.scene.items.filter((i) => i.kind === "reference"),
    ).toHaveLength(1);
    const span = scene.scene.items.find((i) => i.kind === "span")!;
    expect(near(span.pts[0], truth(MARKS[0]))).toBeLessThan(1e-3);
    expect(near(span.pts[1], truth(MARKS[1]))).toBeLessThan(1e-3);
    expect(span.label).toMatch(/^1\.81\d* ± 0\.\d+ m$/);
    // The room's outline is the plan's own mark, with its numbers in words.
    const rings = scene.extras.filter((e) => e.kind === "ring");
    expect(rings.map((r) => r.label)).toEqual([
      "box, picture 2",
      "Walls, picture 2",
      "Room",
    ]);
    const outline = rings[2];
    if (outline.kind !== "ring") throw new Error("no room outline");
    outline.pts.forEach((p, i) =>
      expect(near(p, truth(corners[i]))).toBeLessThan(1e-3),
    );
    expect(outline.closed).toBe(true);
    expect(outline.legs).toHaveLength(4);
    expect(outline.legs![0]).toMatch(/^4\.20? ± 0\.\d+ m$/);
    expect(outline.more![0]).toMatch(/^area 13\.0\d? ± \d/);
    expect(outline.more![1]).toMatch(/^perimeter 14\.6\d? ± \d/);
    if (rings[0].kind !== "ring" || rings[1].kind !== "ring") throw new Error();
    // The box's footprint is centred on the probe, 2000 by 900 mm.
    const cx = rings[0].pts.reduce((t, p) => t + p.x, 0) / 4,
      cy = rings[0].pts.reduce((t, p) => t + p.y, 0) / 4;
    expect(near({ x: cx, y: cy }, truth(probe))).toBeLessThan(1e-3);
    expect(near(rings[0].pts[0], rings[0].pts[1])).toBeCloseTo(2000, 3);
    expect(near(rings[0].pts[1], rings[0].pts[2])).toBeCloseTo(900, 3);
    expect(near(rings[1].pts[0], truth(CORNERS[0]))).toBeLessThan(1e-3);
    expect(near(rings[1].pts[1], truth(CORNERS[1]))).toBeLessThan(1e-3);
    // Where a height was measured is marked; the height itself is not here.
    expect(
      scene.extras.filter(
        (e) => e.kind === "dot" && e.label === "height, picture 2",
      ),
    ).toHaveLength(1);
    // The mark both pictures show: two faint crosses under one named dot.
    expect(
      scene.extras.filter((e) => e.kind === "dot" && e.faint),
    ).toHaveLength(2);
    expect(
      scene.extras.some(
        (e) => e.kind === "dot" && /^R1, \d+ mm apart$/.test(e.label),
      ),
    ).toBe(true);
    const fit = fitBox(scene.scene.bounds),
      prims = layoutExtras(scene.extras, fit);
    expect(
      prims
        .filter((p) => p.t === "text")
        .map((p) => (p.t === "text" ? p.text : "")),
    ).toContain("Walls, picture 2");
    expect(
      prims.every((p) => p.t !== "dot" || (p.x >= 0 && p.x <= fit.width)),
    ).toBe(true);

    const csv = roomCsv(asViews(snaps), sol, true, "m"),
      lines = csv.trim().split("\n");
    expect(lines[0]).toBe(ROOM_CSV_HEADER);
    expect(lines[1]).toMatch(
      /^Picture 1,on the plan,,,,,,,Picture 1 sets the plan's frame/,
    );
    expect(lines[2]).toMatch(
      /^Picture 2,on the plan,,,,,,,"?Picture 2 is on the plan, half way round/,
    );
    const cells = (line: string) => line.split(",");
    const area = cells(lines.find((l) => l.startsWith("room,floor area"))!);
    expect(Number(area[2])).toBeCloseTo(13.02, 2);
    expect(Number(area[3])).toBeGreaterThan(0);
    expect(area[4]).toBe("m²");
    expect(area[5]).toBe("1; 2");
    expect(csv).toContain("Rests on 2 pictures (pictures 1 and 2).");
    const wall1 = cells(lines.find((l) => l.startsWith("room,wall 1"))!);
    expect(Number(wall1[2])).toBeCloseTo(4.2, 3);
    expect(wall1[5]).toBe("1");
    expect(lines.find((l) => l.startsWith("room point 1,position"))).toMatch(
      /,1; 2,.*the pictures put it \d+ mm apart: picture 1 at .* picture 2 at /,
    );
    const spanRow = cells(
      lines.find((l) => l.startsWith("picture 2 span 1,length"))!,
    );
    expect(Number(spanRow[2])).toBeCloseTo(1.8125, 3);
    expect(spanRow[5]).toBe("2");
    expect(boardCorners()).toHaveLength(4);
  });
});
