/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Hand-built pictures of one rectangle of known size lying on a floor, for
// the tests of which side of the reference is the long one. Nothing here
// imports the code under test: the camera, the projection and the noise are
// written out. World millimetres, z up, the floor at z = 0.
import { lcgUniform } from "./seeded";

export type P = { x: number; y: number };
type V = [number, number, number];

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

/** One picture of a rectangle `long` by `short` mm. */
export type Scene = {
  w: number;
  h: number;
  long: number;
  short: number;
  /** Degrees the camera looks down from level (90 is straight down). */
  pitch: number;
  /** Degrees between the camera's heading and the rectangle's long side. */
  yaw: number;
  /** The four corners where an exact tap would land, in order round the
   * rectangle: corners 0 and 1 are the ends of a long side. */
  exact: P[];
  /** The same corners with tap noise of `sigma` pixels (one sd per axis). */
  taps: P[];
};

export type Ask = {
  seed: number;
  /** Tap noise, one sd in picture pixels. */
  sigma?: number;
  /** Fixed sides; otherwise drawn from the sizes people use. */
  long?: number;
  short?: number;
  /** Fixed pitch and yaw in degrees; otherwise drawn. */
  pitch?: number;
  yaw?: number;
  /** Camera roll in degrees; otherwise drawn within 6 either way. */
  roll?: number;
  /** Camera distance from the rectangle, in long sides; otherwise drawn. */
  reach?: number;
  /** How far off the rectangle the camera aims, in long sides. */
  aimOff?: number;
  /** How far the optical axis is from the picture's middle, as a share of
   * the picture's longer side (a cropped photo). 0 unless given. */
  offAxis?: number;
};

const SIZES: [number, number][] = [
  [297, 210],
  [279.4, 215.9],
  [85.6, 53.98],
  [1000, 700],
  [600, 400],
  [900, 300],
];

/** A seeded scene, or null when the draw put a corner outside the picture or
 * behind the camera (the caller draws again with the next seed). */
export function scene(ask: Ask): Scene | null {
  const u = lcgUniform(ask.seed),
    between = (lo: number, hi: number) => lo + (hi - lo) * u(),
    normal = () =>
      Math.sqrt(-2 * Math.log(1 - u())) * Math.cos(2 * Math.PI * u()),
    size = SIZES[Math.floor(u() * SIZES.length)],
    long = ask.long ?? size[0],
    short = ask.short ?? size[1],
    portrait = u() < 0.3,
    w = portrait ? 1200 : 1600,
    h = portrait ? 1600 : 1200,
    rad = Math.PI / 180,
    pitch = ask.pitch ?? between(12, 88),
    yaw = ask.yaw ?? between(0, 360),
    roll = ask.roll ?? between(-6, 6),
    reach = (ask.reach ?? between(1.2, 9)) * long,
    aimOff = ask.aimOff ?? between(0, 0.8),
    aimTurn = between(0, 360) * rad,
    f = between(0.45, 1.3) * Math.max(w, h),
    sigma = ask.sigma ?? 1.5,
    axisTurn = between(0, 360) * rad,
    axisX = w / 2 + (ask.offAxis ?? 0) * Math.max(w, h) * Math.cos(axisTurn),
    axisY = h / 2 + (ask.offAxis ?? 0) * Math.max(w, h) * Math.sin(axisTurn),
    // The rectangle's centre is the origin, its long side along world x. The
    // camera stands `reach` away, heading `yaw` from the long side.
    heading: V = [Math.cos(yaw * rad), Math.sin(yaw * rad), 0],
    target: V = [
      aimOff * long * Math.cos(aimTurn),
      aimOff * long * Math.sin(aimTurn),
      0,
    ],
    eye: V = [
      target[0] - heading[0] * reach * Math.cos(pitch * rad),
      target[1] - heading[1] * reach * Math.cos(pitch * rad),
      reach * Math.sin(pitch * rad),
    ],
    forward = unit(sub(target, eye)),
    // Straight down has no level right; any floor direction will do.
    level: V =
      Math.abs(forward[2]) > 0.999999
        ? [heading[1], -heading[0], 0]
        : unit(cross(forward, [0, 0, 1])),
    below = cross(forward, level),
    c = Math.cos(roll * rad),
    s = Math.sin(roll * rad),
    right: V = [0, 1, 2].map((i) => c * level[i] + s * below[i]) as V,
    down: V = [0, 1, 2].map((i) => -s * level[i] + c * below[i]) as V,
    corners: V[] = [
      [-long / 2, -short / 2, 0],
      [long / 2, -short / 2, 0],
      [long / 2, short / 2, 0],
      [-long / 2, short / 2, 0],
    ],
    exact: P[] = [];
  for (const p of corners) {
    const rel = sub(p, eye),
      depth = dot(rel, forward);
    if (!(depth > 1)) return null;
    const q = {
      x: axisX + (f * dot(rel, right)) / depth,
      y: axisY + (f * dot(rel, down)) / depth,
    };
    if (q.x < 8 || q.y < 8 || q.x > w - 8 || q.y > h - 8) return null;
    exact.push(q);
  }
  const taps = exact.map((q) => ({
    x: q.x + sigma * normal(),
    y: q.y + sigma * normal(),
  }));
  return { w, h, long, short, pitch, yaw: yaw % 360, exact, taps };
}

/** True when the edge from `a` to `b` joins the two taps that are the ends
 * of a long side (taps 0 and 1, or 2 and 3). */
export function isLongEdge(sc: Scene, a: P, b: P): boolean {
  const at = (p: P) => sc.taps.findIndex((t) => t.x === p.x && t.y === p.y),
    i = at(a),
    j = at(b);
  return (
    (i === 0 && j === 1) ||
    (i === 1 && j === 0) ||
    ((i ^ j) === 1 && i + j === 5)
  );
}
