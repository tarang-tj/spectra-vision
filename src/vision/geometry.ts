import type { Point } from "./types";
export function fit(
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  return {
    x: (width - sourceWidth * scale) / 2,
    y: (height - sourceHeight * scale) / 2,
    w: sourceWidth * scale,
    h: sourceHeight * scale,
  };
}
export function project(
  p: Point,
  rect: ReturnType<typeof fit>,
  mirror = false,
) {
  return {
    x: rect.x + (mirror ? 1 - p.x : p.x) * rect.w,
    y: rect.y + p.y * rect.h,
  };
}
export function pinchRatio(points: Point[], aspect = 1) {
  if (points.length !== 21) return Infinity;
  const distance = (a: Point, b: Point) =>
    Math.hypot((a.x - b.x) * aspect, a.y - b.y);
  return (
    distance(points[4], points[8]) /
    Math.max(0.001, distance(points[0], points[9]))
  );
}
export function isPinching(points: Point[], previous: boolean, aspect = 1) {
  return pinchRatio(points, aspect) < (previous ? 0.34 : 0.26);
}
export const HAND_EDGES = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];
export const POSE_EDGES = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [27, 29],
  [29, 31],
  [27, 31],
  [24, 26],
  [26, 28],
  [28, 30],
  [30, 32],
  [28, 32],
  [15, 17],
  [15, 19],
  [16, 18],
  [16, 20],
];
