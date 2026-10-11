/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { fitCamera } from "../src/measure/camera";
import { solveHomography } from "../src/panels/ruler/homography";
import { meshObj, shellMesh } from "../src/panels/ruler/walls/mesh";
import { solveShell } from "../src/panels/ruler/walls/shell";
import {
  BOARD,
  boardCorners,
  ELL,
  ELL_AREA_MM2,
  EYE,
  RECT,
  ROOM,
  sceneFor,
  type P,
} from "./fixtures/walls-scene";

const W = 1920,
  H = 1440,
  scene = sceneFor(W, H);

/** The plane map and camera a reference read in one of two orders gives.
 * `handed` 1 keeps the world's own sense (plane y along world y); -1 reads
 * the board the other way round (plane y against world y), as the Ruler does
 * for a board seen from above. */
function solved(handed: 1 | -1) {
  const plane = (p: P): P =>
      handed === 1
        ? { x: p.x - BOARD.x, y: p.y - BOARD.y }
        : { x: p.x - BOARD.x, y: BOARD.y + BOARD.h - p.y },
    seen = boardCorners().map((c) => ({
      plane: plane(c),
      image: scene.shoot(c.x, c.y),
    })),
    h = solveHomography(
      seen.map((s) => s.image),
      seen.map((s) => s.plane),
    )!,
    camera = fitCamera({ h, width: W, height: H, seen })!;
  return { h, camera, plane };
}
const shellOf = (floor: P[], handed: 1 | -1, tops = floor.map(() => true)) => {
  const { h, camera } = solved(handed);
  return {
    camera,
    shell: solveShell({
      h,
      camera,
      base: floor.map((p) => scene.shoot(p.x, p.y)),
      top: floor.map((p, i) =>
        tops[i] ? scene.shoot(p.x, p.y, ROOM.h) : null,
      ),
      closed: true,
    })!,
  };
};

describe("the room's shell from exact taps", () => {
  it("recovers the camera the scene was drawn with", () => {
    const { camera } = solved(-1);
    expect(camera.focalResolved).toBe(true);
    expect(camera.f).toBeCloseTo(scene.f, 2);
    expect(camera.centre[2]).toBeCloseTo(EYE[2], 2);
  });

  it("gives a 4.2 by 3.1 by 2.44 m room its lengths, heights, areas and volume", () => {
    const { shell } = shellOf(RECT, -1);
    [4200, 3100, 4200, 3100].forEach((mm, i) =>
      expect(shell.walls[i]).toBeCloseTo(mm, 3),
    );
    shell.heights.forEach((z) => expect(z).toBeCloseTo(ROOM.h, 2));
    shell.offs.forEach((off) => expect(off!).toBeLessThan(1e-3));
    expect(shell.meanHeight).toBeCloseTo(ROOM.h, 2);
    expect(shell.floorArea! / (ROOM.w * ROOM.d)).toBeCloseTo(1, 8);
    expect(shell.wallArea! / (2 * (ROOM.w + ROOM.d) * ROOM.h)).toBeCloseTo(
      1,
      5,
    );
    expect(shell.volume! / (ROOM.w * ROOM.d * ROOM.h)).toBeCloseTo(1, 5);
  });

  it("measures an L-shaped room", () => {
    const { shell } = shellOf(ELL, -1);
    [4200, 1800, 1800, 1300, 2400, 3100].forEach((mm, i) =>
      expect(shell.walls[i]).toBeCloseTo(mm, 3),
    );
    expect(shell.floorArea! / ELL_AREA_MM2).toBeCloseTo(1, 8);
    expect(shell.volume! / (ELL_AREA_MM2 * ROOM.h)).toBeCloseTo(1, 5);
  });

  it("gives corners with no ceiling point the mean of the measured heights", () => {
    const { shell } = shellOf(RECT, -1, [true, false, false, true]);
    expect(shell.heights[1]).toBeNull();
    expect(shell.heights[2]).toBeNull();
    expect(shell.meanHeight).toBeCloseTo(ROOM.h, 2);
    expect(shell.volume! / (ROOM.w * ROOM.d * ROOM.h)).toBeCloseTo(1, 5);
  });

  it("has no heights, wall area or volume with no ceiling point, or with an unresolved focal length", () => {
    const none = shellOf(RECT, -1, [false, false, false, false]).shell;
    expect(none.meanHeight).toBeNull();
    expect(none.wallArea).toBeNull();
    expect(none.volume).toBeNull();
    expect(none.floorArea! / (ROOM.w * ROOM.d)).toBeCloseTo(1, 8);
    const { h, camera } = solved(-1),
      blind = solveShell({
        h,
        camera: { ...camera, focalResolved: false },
        base: RECT.map((p) => scene.shoot(p.x, p.y)),
        top: RECT.map((p) => scene.shoot(p.x, p.y, ROOM.h)),
        closed: true,
      })!;
    expect(blind.heights.every((z) => z === null)).toBe(true);
    expect(blind.volume).toBeNull();
  });

  it("has no area for an open outline or one that crosses itself", () => {
    const { h, camera } = solved(-1),
      at = (p: P) => scene.shoot(p.x, p.y),
      open = solveShell({
        h,
        camera,
        base: RECT.map(at),
        top: RECT.map(() => null),
        closed: false,
      })!,
      bow = solveShell({
        h,
        camera,
        base: [RECT[0], RECT[2], RECT[1], RECT[3]].map(at),
        top: RECT.map(() => null),
        closed: true,
      })!;
    expect(open.walls).toHaveLength(3);
    expect(open.floorArea).toBeNull();
    expect(bow.floorArea).toBeNull();
  });
});

/** Parse OBJ text into vertices and faces (0-based indices). */
function parseObj(text: string) {
  const v: number[][] = [],
    f: number[][] = [],
    groups: string[] = [];
  for (const line of text.split("\n")) {
    const [tag, ...rest] = line.trim().split(/\s+/);
    if (tag === "v") v.push(rest.map(Number));
    else if (tag === "f") f.push(rest.map((t) => Number(t) - 1));
    else if (tag === "g") groups.push(rest[0]);
  }
  return { v, f, groups };
}
const signedArea = (pts: number[][]) =>
  pts.reduce((t, a, i) => {
    const b = pts[(i + 1) % pts.length];
    return t + (a[0] * b[1] - b[0] * a[1]) / 2;
  }, 0);

describe("the OBJ export", () => {
  it("parses, with two vertices per corner and a face per wall plus floor and ceiling", () => {
    const { shell, camera } = shellOf(ELL, -1),
      obj = parseObj(meshObj(shellMesh(shell, camera.handed)!, "test")),
      xs = obj.v.map((p) => p[0]),
      ys = obj.v.map((p) => p[1]),
      zs = obj.v.map((p) => p[2]);
    expect(obj.v).toHaveLength(12);
    expect(obj.f).toHaveLength(8);
    expect(obj.groups).toEqual([
      "floor",
      ...[1, 2, 3, 4, 5, 6].map((i) => `wall_${i}`),
      "ceiling",
    ]);
    expect(obj.v.flat().every(Number.isFinite)).toBe(true);
    expect(obj.f.flat().every((i) => i >= 0 && i < 12)).toBe(true);
    // The bounding box is the room, in metres.
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4.2, 3);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(3.1, 3);
    expect(Math.min(...zs)).toBe(0);
    expect(Math.max(...zs)).toBeCloseTo(2.44, 3);
  });

  it.each([1, -1] as const)(
    "is the real room, not its mirror image, when the reference is read with handedness %i",
    (handed) => {
      const { shell, camera } = shellOf(ELL, handed);
      expect(camera.handed).toBe(handed);
      const obj = parseObj(meshObj(shellMesh(shell, camera.handed)!, "test")),
        floor = obj.v.slice(0, ELL.length),
        truth = ELL.map((p) => [p.x / 1000, p.y / 1000]);
      // Seen from above (z up), the taps run the same way round as in truth.
      expect(Math.sign(signedArea(floor))).toBe(Math.sign(signedArea(truth)));
      expect(signedArea(floor)).toBeCloseTo(ELL_AREA_MM2 / 1e6, 3);
      // Stronger: every vertex is the true one, moved but never flipped.
      const dx = floor[0][0] - truth[0][0],
        dy = floor[0][1] - truth[0][1];
      floor.forEach((p, i) => {
        expect(p[0] - dx).toBeCloseTo(truth[i][0], 3);
        expect(p[1] - dy).toBeCloseTo(truth[i][1], 3);
      });
      // Normals point into the room: the floor's is up, and each wall's
      // points from the wall toward the inside.
      const normal = (at: number[]) => {
        const [a, b, c] = at.map((i) => obj.v[i]),
          u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
          w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        return [
          u[1] * w[2] - u[2] * w[1],
          u[2] * w[0] - u[0] * w[2],
          u[0] * w[1] - u[1] * w[0],
        ];
      };
      expect(normal(obj.f[0])[2]).toBeGreaterThan(0);
      expect(normal(obj.f[obj.f.length - 1])[2]).toBeLessThan(0);
      // Wall 1 runs along the true y = 0 side; inside is toward +y.
      expect(normal(obj.f[1])[1]).toBeGreaterThan(0);
    },
  );

  it("is the floor alone when no height was measured, and nothing until the room is closed", () => {
    const { shell, camera } = shellOf(RECT, -1, [false, false, false, false]),
      mesh = shellMesh(shell, camera.handed)!;
    expect(mesh.verts).toHaveLength(4);
    expect(mesh.faces.map((f) => f.name)).toEqual(["floor"]);
    expect(shellMesh({ ...shell, closed: false }, camera.handed)).toBeNull();
  });
});
