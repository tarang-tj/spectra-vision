/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A synthetic room for the Walls tests, with exact truth. World millimetres,
// right-handed, z up, the floor at z = 0. A pinhole camera with square pixels
// and its axis through the picture's centre stands outside the near wall and
// looks in, so every floor and ceiling corner is in view. Nothing here imports
// the code under test: the projection is written out by hand.

export type P = { x: number; y: number };
type V = [number, number, number];

/** A 4.2 m by 3.1 m room, 2.44 m high. */
export const ROOM = { w: 4200, d: 3100, h: 2440 };
/** Its floor corners, counter-clockwise seen from above. */
export const RECT: P[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];
/** The same room with a 1.8 m by 1.3 m corner cut out: an L. */
export const ELL: P[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 1800 },
  { x: 2400, y: 1800 },
  { x: 2400, y: 3100 },
  { x: 0, y: 3100 },
];
export const ELL_AREA_MM2 = 4200 * 3100 - 1800 * 1300;
/** The reference: a 1000 x 700 mm board flat on the floor, long side along x. */
export const BOARD = { x: 1600, y: 700, w: 1000, h: 700 };
export const boardCorners = (): P[] => [
  { x: BOARD.x, y: BOARD.y },
  { x: BOARD.x + BOARD.w, y: BOARD.y },
  { x: BOARD.x + BOARD.w, y: BOARD.y + BOARD.h },
  { x: BOARD.x, y: BOARD.y + BOARD.h },
];

/** Where the camera stands and what it looks at. */
export const EYE: V = [2100, -4200, 1900];
const TARGET: V = [2100, 1200, 900];
/** Focal length as a share of the picture's width (a phone's main camera). */
export const FOCAL = 0.75;

const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a: V, b: V): V => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  unit = (a: V): V => {
    const n = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / n, a[1] / n, a[2] / n];
  };
// Camera axes in the world: x right, y down, z forward, as in a picture.
const FORWARD = unit(sub(TARGET, EYE)),
  RIGHT = unit(cross(FORWARD, [0, 0, 1])),
  DOWN = cross(FORWARD, RIGHT);

/** The true camera for a picture `w` by `h` pixels: `shoot` gives the pixel
 * a world point lands on. */
export function sceneFor(w: number, h: number) {
  const f = FOCAL * w;
  return {
    w,
    h,
    f,
    shoot(x: number, y: number, z = 0): P {
      const rel = sub([x, y, z], EYE),
        depth = dot(rel, FORWARD);
      return {
        x: w / 2 + (f * dot(rel, RIGHT)) / depth,
        y: h / 2 + (f * dot(rel, DOWN)) / depth,
      };
    },
  };
}

/** Runs in the browser; returns a PNG as base64. Self-contained (no imports).
 * Every argument is a list of picture points already projected by `shoot`. */
export function drawWallsRoom(args: {
  w: number;
  h: number;
  floor: { x: number; y: number }[];
  ceiling: { x: number; y: number }[];
  board: { x: number; y: number }[];
}): string {
  const { w, h, floor, ceiling, board } = args,
    canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!,
    poly = (pts: { x: number; y: number }[], fill: string | null) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.stroke();
    };
  ctx.fillStyle = "#5a5a5a";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 2;
  poly(floor, "#828282");
  // Wall edges and the ceiling outline, from the same camera.
  floor.forEach((p, i) => poly([p, ceiling[i]], null));
  poly(ceiling, null);
  poly(board, "#f5f5f5");
  return canvas.toDataURL("image/png").split(",")[1];
}
