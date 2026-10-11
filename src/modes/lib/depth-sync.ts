/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which picture a depth map is drawn over. A map takes 0.3 to 1 s to make, so
// on a camera or a video the live picture has moved on by the time it
// arrives, and the map drawn over it sits beside the thing it describes. The
// rule: a map is drawn only over the frame it was computed from. That is the
// live picture when the source is a still or the map is fresh, the held frame
// (TaskResult.frame) otherwise, and nothing at all when neither is to hand.
import { formatMeasured } from "../../measure/format";
import { measured, type Measured } from "../../measure/noise";
import type { Frame } from "../../vision/frame";
import type { TaskResult } from "../../vision/types";

/** A map this old or younger (ms) belongs to the picture on screen: about
 * three drawn frames, less than a hand moves across a cell of the map. */
export const FRESH_MS = 100;
/** What the age is good to (s): one drawn frame, one video frame and the
 * rounding to a tenth of a second. */
const LAG_ERROR_S = 0.1;

export type DepthSync =
  /** Draw over what the stage already shows. */
  | { over: "live" }
  /** Draw the held frame, then the map over it. `lag` is how far behind the
   * live picture that is; null while the stage is paused (time stands still). */
  | { over: "held"; image: CanvasImageSource; lag: Measured | null }
  /** The picture moved on and there is no frame to go with the map. */
  | { over: "nothing"; lag: Measured };

const lagOf = (ms: number): Measured =>
  measured(
    Math.round(ms / 100) / 10,
    LAG_ERROR_S,
    "s",
    "Time since the frame under the map was read from the video, on this page's clock. The bar covers one drawn frame, one video frame and rounding.",
  );

/** `moving` is whether the source is a video or a camera. */
export function depthSync(
  task: Pick<TaskResult, "time" | "frame">,
  frame: Pick<Frame, "time" | "paused">,
  moving: boolean,
): DepthSync {
  if (!moving) return { over: "live" };
  const held = task.frame,
    age = frame.time - (held?.capturedAt ?? task.time);
  if (held)
    return {
      over: "held",
      image: held.image,
      lag: frame.paused ? null : lagOf(Math.max(0, age)),
    };
  // No clock reading means no claim that the map is fresh.
  return age <= FRESH_MS
    ? { over: "live" }
    : { over: "nothing", lag: lagOf(age) };
}

/** The line the stage adds for a map that is not of the live picture, or ""
 * when the two are the same moment. */
export function lagLine(sync: DepthSync): string {
  if (sync.over === "live") return "";
  if (sync.over === "nothing")
    return `Map not drawn: it is ${formatMeasured(sync.lag)} old and the picture has moved on.`;
  return sync.lag
    ? `Picture and map: ${formatMeasured(sync.lag)} behind live.`
    : "Paused on the frame the map was made from.";
}

/** True for a video or camera element (a still has no videoWidth). */
export const isMoving = (frame: Pick<Frame, "source">): boolean =>
  !!frame.source && "videoWidth" in frame.source.element;
