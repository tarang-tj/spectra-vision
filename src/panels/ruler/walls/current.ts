/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls numbers for the picture as it stands, worked out once per change
// of the taps, the reference or the camera, however often the stage or the
// panel asks.
import type { Camera } from "../../../measure/camera";
import { cameraOf, cameraTrials, tapSigma, type Trials } from "../camera-of";
import type { Derived } from "../derive";
import type { RulerState } from "../state";
import { shellMesh, type Mesh } from "./mesh";
import { measureWalls, type Numbers } from "./numbers";
import { offPlumb } from "./off-plumb";
import { getWalls, type WallsState } from "./store";
import { basisOf, heightUncertain } from "./text";

export type Current = {
  camera: Camera | null;
  /** Null with no floor corner, no solved reference, or a corner at or
   * beyond the horizon of the surface. */
  numbers: Numbers | null;
  /** Corners whose ceiling point is not above them (see off-plumb.ts). */
  offCorners: number[];
  /** The closed shell for the preview and the export. Floor only unless the
   * mean height has a bar; null until the room is closed. */
  mesh: Mesh | null;
  /** The same for the 3D preview, but floor only when the mean height is too
   * uncertain to state: walls drawn at that height would look measured. */
  preview: Mesh | null;
  /** What the bars of `numbers` cover, for this reference and lens. */
  basis: string;
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
    trials = d.sheet && walls.corners.length ? cameraTrials(s, d) : null,
    basis = basisOf(d);
  if (
    memo &&
    memo.walls === walls &&
    memo.value.basis === basis &&
    // The camera and its retakes are keyed by content (camera-of.ts), so
    // their identity stands for the sheet and the lens too.
    memo.camera === camera &&
    memo.trials === trials
  )
    return memo.value;
  const numbers =
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
    shown = numbers && {
      ...numbers.shell,
      ...(numbers.meanHeight
        ? {}
        : { meanHeight: null, heights: numbers.shell.heights.map(() => null) }),
    },
    mesh = shown && camera ? shellMesh(shown, camera.handed) : null;
  const value: Current = {
    camera,
    numbers,
    mesh,
    preview:
      mesh && shown && camera && numbers && heightUncertain(numbers)
        ? shellMesh(
            {
              ...shown,
              meanHeight: null,
              heights: shown.heights.map(() => null),
            },
            camera.handed,
          )
        : mesh,
    offCorners: d.sheet ? offPlumb(s, d, camera, walls.corners) : [],
    basis,
  };
  memo = { walls, sheet: d.sheet, lens: d.lens, camera, trials, value };
  return value;
}
