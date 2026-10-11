/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import {
  fitCamera,
  heightAbove,
  horizontalFov,
  pixelRay,
  projectByPose,
  projectPoint,
  toCamera,
  type Plumb,
} from "../src/measure/camera";
import { invert3, mulMat, rodrigues } from "../src/measure/vec";
import { solveHomography, type Pt } from "../src/panels/ruler/homography";
import { gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";

// A camera built by hand, with no code shared with the fit. World x and y lie
// on the floor (mm) and `upSign` says which way world z points: +1 puts the
// camera on the +z side, -1 on the -z side (a reference tapped the other way
// round).
const W = 1920,
  H = 1440;
type Truth = {
  f: number;
  r: number[];
  t: [number, number, number];
  upSign: 1 | -1;
};

/** A camera `height` mm above the floor point it looks at from `back` mm
 * away, pitched down by `pitch` degrees, then turned and rolled. */
function truth(
  f: number,
  pitchDeg: number,
  distance: number,
  yawDeg = 0,
  rollDeg = 0,
  upSign: 1 | -1 = 1,
): Truth {
  const rad = Math.PI / 180,
    // Start looking straight down at the floor from above (camera z = -world
    // z), then tilt up toward the horizon.
    down =
      upSign === 1
        ? [1, 0, 0, 0, -1, 0, 0, 0, -1]
        : [1, 0, 0, 0, 1, 0, 0, 0, 1],
    tilt = rodrigues([-(90 - pitchDeg) * rad, 0, 0]),
    roll = rodrigues([0, 0, rollDeg * rad]),
    yaw = rodrigues([0, 0, yawDeg * rad]),
    r = mulMat(roll, mulMat(tilt, mulMat(down, yaw)));
  return { f, r, t: [0, 0, distance], upSign };
}
function shoot(c: Truth, x: number, y: number, z = 0): Pt {
  const p = [x, y, z * c.upSign],
    cx = c.r[0] * p[0] + c.r[1] * p[1] + c.r[2] * p[2] + c.t[0],
    cy = c.r[3] * p[0] + c.r[4] * p[1] + c.r[5] * p[2] + c.t[1],
    cz = c.r[6] * p[0] + c.r[7] * p[1] + c.r[8] * p[2] + c.t[2];
  if (!(cz > 0)) throw new Error("test point is behind the true camera");
  return { x: (c.f * cx) / cz + W / 2, y: (c.f * cy) / cz + H / 2 };
}
/** A floor position `ahead` mm past the origin along the way the camera
 * faces, and `side` mm across it. */
function floor(c: Truth, ahead: number, side: number): [number, number] {
  const n = Math.hypot(c.r[6], c.r[7]),
    fx = c.r[6] / n,
    fy = c.r[7] / n;
  return [ahead * fx - side * fy, ahead * fy + side * fx];
}

// A US Letter sheet near the middle of the view.
const SHEET: Pt[] = [
  { x: -139.7, y: -107.95 },
  { x: 139.7, y: -107.95 },
  { x: 139.7, y: 107.95 },
  { x: -139.7, y: 107.95 },
];
/** Wall corners well past the sheet: [mm ahead, mm to the side]. */
const PLUMB_AT: [number, number][] = [
  [1500, -900],
  [1800, 1100],
];

function fitFrom(
  c: Truth,
  noise?: () => number,
  sigma = 0,
  withPlumbs = false,
) {
  const n = (p: Pt): Pt =>
      noise ? { x: p.x + sigma * noise(), y: p.y + sigma * noise() } : p,
    image = SHEET.map((p) => n(shoot(c, p.x, p.y))),
    h = solveHomography(image, SHEET);
  if (!h) return null;
  const plumbs: Plumb[] = withPlumbs
    ? PLUMB_AT.map(([ahead, side]) => {
        const [x, y] = floor(c, ahead, side);
        return { a: n(shoot(c, x, y, 0)), b: n(shoot(c, x, y, 2000)) };
      })
    : [];
  return fitCamera({
    h,
    width: W,
    height: H,
    seen: SHEET.map((plane, i) => ({ plane, image: image[i] })),
    plumbs,
  });
}

describe("camera from a flat reference", () => {
  const c = truth(1500, 35, 1800, 20, 3);

  it("recovers the focal length and the camera's height with exact taps", () => {
    const cam = fitFrom(c)!;
    expect(cam).not.toBeNull();
    expect(cam.f).toBeCloseTo(1500, 2);
    expect(cam.rms).toBeLessThan(1e-6);
    expect(cam.focalResolved).toBe(true);
    // The camera looks at the origin from 1800 mm away, 35 degrees down.
    expect(cam.centre[2]).toBeCloseTo(1800 * Math.sin((35 * Math.PI) / 180), 2);
    expect(horizontalFov(cam)).toBeCloseTo(
      (2 * Math.atan(960 / 1500) * 180) / Math.PI,
      3,
    );
  });

  it("draws points on and above the floor where the true camera sees them", () => {
    const cam = fitFrom(c)!;
    for (const [ahead, side, z] of [
      [0, 0, 0],
      [900, -600, 0],
      [-300, 400, 750],
      [1500, 900, 2100],
    ]) {
      const [x, y] = floor(c, ahead, side),
        want = shoot(c, x, y, z),
        got = projectPoint(cam, x, y, z)!,
        byPose = projectByPose(cam, x, y, z)!;
      expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-3);
      expect(Math.hypot(byPose.x - want.x, byPose.y - want.y)).toBeLessThan(
        1e-3,
      );
    }
  });

  it("reads a height above a floor point, and says when a tap is off the plumb line", () => {
    const cam = fitFrom(c)!,
      [bx, by] = floor(c, 1200, 500),
      base = { x: bx, y: by },
      top = shoot(c, base.x, base.y, 2030),
      read = heightAbove(cam, base, top)!;
    expect(read.z).toBeCloseTo(2030, 2);
    expect(read.off).toBeLessThan(1e-3);
    const aside = heightAbove(cam, base, { x: top.x + 40, y: top.y })!;
    expect(aside.off).toBeGreaterThan(20);
  });

  it("puts the camera above the floor whichever way round the reference was tapped", () => {
    const flipped = truth(1500, 35, 1800, 20, 3, -1),
      cam = fitFrom(flipped)!;
    expect(cam.handed).toBe(-1);
    expect(fitFrom(c)!.handed).toBe(1);
    expect(cam.centre[2]).toBeGreaterThan(0);
    const [x, y] = floor(flipped, 800, 300),
      want = shoot(flipped, x, y, 1200),
      got = projectPoint(cam, x, y, 1200)!;
    expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-3);
    expect(heightAbove(cam, { x, y }, want)!.z).toBeCloseTo(1200, 2);
  });

  it("agrees with its own ray and camera coordinates", () => {
    const cam = fitFrom(c)!,
      [x, y] = floor(c, 600, -700),
      px = shoot(c, x, y, 400),
      ray = pixelRay(cam, px),
      // Walk the ray to height 400 and land on the point.
      k = (400 - ray.origin[2]) / ray.dir[2],
      hit = [0, 1, 2].map((i) => ray.origin[i] + k * ray.dir[i]);
    expect(hit[0]).toBeCloseTo(x, 2);
    expect(hit[1]).toBeCloseTo(y, 2);
    expect(toCamera(cam, 0, 0, 0)[2]).toBeCloseTo(1800, 2);
  });

  it("does not claim a focal length when the camera faces the floor squarely", () => {
    const cam = fitFrom(truth(1500, 90, 1800))!;
    expect(cam).not.toBeNull();
    expect(cam.focalResolved).toBe(false);
    // Positions on the floor are still exact.
    const want = shoot(truth(1500, 90, 1800), 300, 200),
      got = projectPoint(cam, 300, 200, 0)!;
    expect(Math.hypot(got.x - want.x, got.y - want.y)).toBeLessThan(1e-6);
  });

  it("returns null for a plane map that cannot be inverted", () => {
    expect(
      fitCamera({
        h: [1, 2, 3, 2, 4, 6, 0, 0, 0],
        width: W,
        height: H,
        seen: SHEET.map((plane) => ({ plane, image: plane })),
      }),
    ).toBeNull();
    expect(invert3([1, 2, 3, 2, 4, 6, 0, 0, 0])).toBeNull();
  });
});

describe("camera from noisy taps", () => {
  // A phone held at chest height looking across a room: the sheet is small in
  // the picture, so its own perspective says little about the focal length.
  const c = truth(1400, 28, 2600, -15, 2),
    SIGMA = 1.5,
    TRIALS = 120;
  const errors = (withPlumbs: boolean) => {
    const normal = gaussian(seededRandom(20261010)),
      out: number[] = [];
    for (let i = 0; i < TRIALS; i++) {
      const cam = fitFrom(c, normal, SIGMA, withPlumbs);
      if (cam) out.push(Math.abs(cam.f - c.f) / c.f);
    }
    return out.sort((a, b) => a - b);
  };
  const median = (v: number[]) => v[Math.floor(v.length / 2)];

  it("two plumb edges cut the focal length error by more than half", () => {
    const bare = errors(false),
      plumbed = errors(true);
    expect(bare.length).toBeGreaterThan(TRIALS * 0.9);
    expect(plumbed.length).toBeGreaterThan(TRIALS * 0.9);
    expect(median(plumbed)).toBeLessThan(0.5 * median(bare));
    expect(median(plumbed)).toBeLessThan(0.05);
  });
});
