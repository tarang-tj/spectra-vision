/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// A room's shell from one picture: the floor outline through the plane map,
// and a ceiling height above each corner through the camera. Pure: no DOM, no
// clock, no randomness. Lengths are mm, areas mm2, volume mm3.
import { heightAbove, type Camera, type P2 } from "../../../measure/camera";
import { applyHomography, type Mat3 } from "../homography";
import { legLengths, polygonArea, selfIntersects } from "../shapes";

export type ShellInput = {
  /** Flat picture points to plane mm. */
  h: Mat3;
  /** Null, or one whose focal length is not resolved: no heights then. */
  camera: Camera | null;
  /** Floor corners in tap order, as flat picture points. */
  base: readonly P2[];
  /** For each corner, where its wall edge meets the ceiling, or null. */
  top: readonly (P2 | null)[];
  closed: boolean;
};

export type Shell = {
  /** Floor corners on the plane. */
  floor: P2[];
  closed: boolean;
  /** Wall `i` runs from corner `i` to corner `i + 1`. */
  walls: number[];
  /** Height above each corner that has a ceiling point, else null. */
  heights: (number | null)[];
  /** How far each ceiling point is from the plumb line through its corner,
   * in picture pixels. */
  offs: (number | null)[];
  /** Mean of the measured heights; null when none was measured. */
  meanHeight: number | null;
  /** Null for an open outline or one whose sides cross. */
  floorArea: number | null;
  wallArea: number | null;
  volume: number | null;
};

/** The height the shell uses at corner `i`: its own if measured, otherwise
 * the mean of the measured ones (an assumption, and labelled as one). */
export const heightAt = (shell: Shell, i: number): number | null =>
  shell.heights[i] ?? shell.meanHeight;

/** Solve the shell, or null when a floor corner lies at or beyond the horizon
 * of the surface. */
export function solveShell(input: ShellInput): Shell | null {
  const { h, camera, base, top, closed } = input,
    floor: P2[] = [];
  for (const p of base) {
    const q = applyHomography(h, p);
    if (!q) return null;
    floor.push(q);
  }
  const walls = legLengths(floor, closed),
    usable = camera && camera.focalResolved ? camera : null,
    heights: (number | null)[] = [],
    offs: (number | null)[] = [];
  floor.forEach((corner, i) => {
    const t = top[i],
      got = usable && t ? heightAbove(usable, corner, t) : null;
    // A ceiling below the floor is a tap on the wrong side of the corner.
    heights.push(got && got.z > 0 ? got.z : null);
    offs.push(got && got.z > 0 ? got.off : null);
  });
  const seen = heights.filter((z): z is number => z !== null),
    meanHeight = seen.length
      ? seen.reduce((t, z) => t + z, 0) / seen.length
      : null,
    floorArea =
      closed && floor.length >= 3 && !selfIntersects(floor)
        ? polygonArea(floor)
        : null,
    shell: Shell = {
      floor,
      closed,
      walls,
      heights,
      offs,
      meanHeight,
      floorArea,
      wallArea: null,
      volume: null,
    };
  if (meanHeight !== null && closed && floor.length >= 3) {
    // Each wall is a flat face between two plumb edges of possibly different
    // height. The volume takes the ceiling as level at the mean corner height.
    const each = floor.map((_, i) => heightAt(shell, i) ?? meanHeight);
    shell.wallArea = walls.reduce(
      (t, len, i) => t + (len * (each[i] + each[(i + 1) % each.length])) / 2,
      0,
    );
    if (floorArea !== null)
      shell.volume =
        (floorArea * each.reduce((t, z) => t + z, 0)) / each.length;
  }
  return shell;
}
