/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One synthetic room seen by four cameras, with exact truth, for the tests of
// several pictures on one plan. World millimetres, right-handed, z up, the
// floor at z = 0. Each camera is a pinhole with square pixels and its axis
// through the picture's middle; it stands against one wall and looks across
// the room, so it sees the board and the two far floor corners and no more.
// Nothing here imports the code under test: every projection and every frame
// is written out by hand.

export type P = { x: number; y: number };
export type V = [number, number, number];

/** A 4.2 m by 3.1 m room. */
export const ROOM = { w: 4200, d: 3100 };
/** Its floor corners, in order round the room. */
export const CORNERS: P[] = [
  { x: 0, y: 0 },
  { x: 4200, y: 0 },
  { x: 4200, y: 3100 },
  { x: 0, y: 3100 },
];
export const AREA_MM2 = ROOM.w * ROOM.d;
export const PERIMETER_MM = 2 * (ROOM.w + ROOM.d);
export const WALLS_MM = [ROOM.w, ROOM.d, ROOM.w, ROOM.d];

/** The reference: a board flat on the floor, long side along x, and on
 * purpose not in the middle of the room: a picture placed the wrong way round
 * then puts its corners visibly somewhere else. */
export type Board = { x: number; y: number; w: number; h: number };
export const BOARD: Board = { x: 1300, y: 1000, w: 1000, h: 700 };
/** A board twice that size, for judging the bars from both sides. */
export const BIG_BOARD: Board = { x: 900, y: 700, w: 2000, h: 1400 };
/** The board's corners in the order they run clockwise in any picture taken
 * from above the floor: starting at the corner with the least x and most y. */
export const boardCorners = (b: Board = BOARD): P[] => [
  { x: b.x, y: b.y + b.h },
  { x: b.x + b.w, y: b.y + b.h },
  { x: b.x + b.w, y: b.y },
  { x: b.x, y: b.y },
];
export const boardCentre = (b: Board = BOARD): P => ({
  x: b.x + b.w / 2,
  y: b.y + b.h / 2,
});

/** Marks on the floor that every camera sees: one close beside the board,
 * one further off, and (see `boardCentre`) one that cannot tell which way
 * round the board is. */
export const MARKS: P[] = [
  { x: 2650, y: 1250 },
  { x: 1000, y: 2000 },
];

/** Where each camera stands and what it looks at. In this order the second
 * and fourth look along the board's long side (a quarter turn from the
 * first) and the third looks back at the first (a half turn). */
export const CAMERAS: { eye: V; target: V }[] = [
  { eye: [2100, 150, 1600], target: [2050, 1900, 0] },
  { eye: [4050, 1550, 1600], target: [1900, 1500, 0] },
  { eye: [2100, 2950, 1600], target: [2050, 1100, 0] },
  { eye: [150, 1550, 1600], target: [2200, 1500, 0] },
];
/** Focal length as a share of the picture's width (a wide phone lens). */
export const FOCAL = 0.6;

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

/** Camera `i` for a picture `w` by `h` pixels: `shoot` gives the pixel a
 * floor point lands on, `sees` whether that is inside the picture. */
export function cameraFor(i: number, w = 1600, h = 1200) {
  const { eye, target } = CAMERAS[i],
    FORWARD = unit(sub(target, eye)),
    RIGHT = unit(cross(FORWARD, [0, 0, 1])),
    DOWN = cross(FORWARD, RIGHT),
    f = FOCAL * w,
    shoot = (x: number, y: number, z = 0): P => {
      const rel = sub([x, y, z], eye),
        depth = dot(rel, FORWARD);
      return {
        x: w / 2 + (f * dot(rel, RIGHT)) / depth,
        y: h / 2 + (f * dot(rel, DOWN)) / depth,
      };
    };
  return {
    w,
    h,
    f,
    shoot,
    /** The part of the floor's edge in front of the camera, as picture
     * points in order: the floor as this picture shows it. */
    floorSeen(step = 50): P[] {
      const out: P[] = [];
      CORNERS.forEach((a, i) => {
        const b = CORNERS[(i + 1) % 4],
          n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step);
        for (let k = 0; k < n; k++) {
          const x = a.x + ((b.x - a.x) * k) / n,
            y = a.y + ((b.y - a.y) * k) / n;
          if (dot(sub([x, y, 0], eye), FORWARD) > 250) out.push(shoot(x, y));
        }
      });
      return out;
    },
    sees(p: P, margin = 12): boolean {
      if (dot(sub([p.x, p.y, 0], eye), FORWARD) <= 0) return false;
      const q = shoot(p.x, p.y);
      return (
        q.x >= margin && q.y >= margin && q.x <= w - margin && q.y <= h - margin
      );
    },
  };
}

/** A floor point in the Ruler's own plane frame when that frame is anchored
 * at board corner `k`: origin at that corner, x toward the next corner
 * clockwise, y toward the one before. Which `k` a picture gets depends on
 * where its camera stands; all four are the same floor, turned. */
export function inBoardFrame(p: P, k: number, b: Board = BOARD): P {
  const c = boardCorners(b),
    o = c[k % 4],
    nx = c[(k + 1) % 4],
    ny = c[(k + 3) % 4],
    lx = Math.hypot(nx.x - o.x, nx.y - o.y),
    ly = Math.hypot(ny.x - o.x, ny.y - o.y);
  return {
    x: ((p.x - o.x) * (nx.x - o.x) + (p.y - o.y) * (nx.y - o.y)) / lx,
    y: ((p.x - o.x) * (ny.x - o.x) + (p.y - o.y) * (ny.y - o.y)) / ly,
  };
}

/** Runs in the browser; returns a PNG as base64. Self-contained (no imports).
 * Every point is a picture point already projected by `shoot`; the browser
 * clips what falls outside. `tick` marks one board corner, as a pencil mark
 * on a real sheet would, so a person can tell which way round it lies. */
export function drawRoomView(args: {
  w: number;
  h: number;
  floor: { x: number; y: number }[];
  board: { x: number; y: number }[];
  marks: { x: number; y: number }[];
  tick: { x: number; y: number };
  name: string;
}): string {
  const { w, h, floor, board, marks, tick, name } = args,
    canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!,
    poly = (pts: { x: number; y: number }[], fill: string) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    };
  ctx.fillStyle = "#4d5357";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 3;
  poly(floor, "#8a857c");
  poly(board, "#f5f5f5");
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.arc(tick.x, tick.y, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 2;
  for (const m of marks) {
    ctx.beginPath();
    ctx.moveTo(m.x - 9, m.y);
    ctx.lineTo(m.x + 9, m.y);
    ctx.moveTo(m.x, m.y - 9);
    ctx.lineTo(m.x, m.y + 9);
    ctx.stroke();
  }
  ctx.fillStyle = "#f5f5f5";
  ctx.font = "600 28px sans-serif";
  ctx.fillText(name, 24, 44);
  return canvas.toDataURL("image/png").split(",")[1];
}
