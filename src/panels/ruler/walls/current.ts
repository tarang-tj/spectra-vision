/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls numbers for the picture as it stands, worked out once per change
// of the taps, the reference or the camera, however often the stage or the
// panel asks.
import type { Camera } from "../../../measure/camera";
import { cameraOf, cameraTrials, tapSigma, type Trials } from "../camera-of";
import type { Derived } from "../derive";
import type { RulerState } from "../state";
import { measureWalls, type Numbers } from "./numbers";
import { offPlumb } from "./off-plumb";
import { getWalls, type WallsState } from "./store";

export type Current = {
  camera: Camera | null;
  /** Null with no floor corner, no solved reference, or a corner at or
   * beyond the horizon of the surface. */
  numbers: Numbers | null;
  /** Corners whose ceiling point is not above them (see off-plumb.ts). */
  offCorners: number[];
};

let memo: {
  walls: WallsState;
  sheet: Derived["sheet"];
  lens: Derived["lens"];
  camera: Camera | null;
  trials: Trials | null;
  value: Current;
} | null = null;

export function currentWalls(
  s: RulerState,
  d: Derived,
  walls: WallsState = getWalls(),
): Current {
  const camera = cameraOf(s, d),
    // No retakes are simulated until there is something to measure.
    trials = d.sheet && walls.corners.length ? cameraTrials(s, d) : null;
  if (
    memo &&
    memo.walls === walls &&
    memo.sheet === d.sheet &&
    memo.lens === d.lens &&
    memo.camera === camera &&
    memo.trials === trials
  )
    return memo.value;
  const value: Current = {
    camera,
    numbers:
      d.sheet && trials
        ? measureWalls({
            h: d.sheet.h,
            camera,
            lens: d.lens,
            trials: trials.trials,
            corners: walls.corners,
            closed: walls.closed,
            sigma: tapSigma(s),
          })
        : null,
    offCorners: d.sheet ? offPlumb(s, d, camera, walls.corners) : [],
  };
  memo = { walls, sheet: d.sheet, lens: d.lens, camera, trials, value };
  return value;
}
