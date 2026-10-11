/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which pair of opposite sides of the reference is the long one. How long a
// side looks on screen is no guide: a sheet seen along its long side shows
// that side shorter than the other. What perspective cannot fake is the
// camera. Each of the two ways round gives a plane map, and a camera with
// square pixels and its axis through the picture's middle is fitted to each
// (src/measure/camera.ts). The wrong way round stretches the plane by the
// reference's aspect ratio squared, which such a camera often cannot
// reproduce: its fit then misses the four taps by more than tap noise allows.
//
// Often is not always. Four taps give eight numbers and the camera has seven,
// so one number is left to judge by, and for some pictures (the camera
// heading square along one side of the sheet, or looking straight down, or a
// small or nearly square sheet) both ways round fit. Then the on-screen guess
// stands and the panel says it is a guess. Pure: no DOM, no clock.
import { fitCamera } from "../../measure/camera";
import { looksLong, solveHomography, type Pt } from "./homography";

export type LongSide = {
  /** True when corner 0 to corner 1 is the long side, before any Swap. */
  firstIsLong: boolean;
  /** "picture": the camera fit settles it. "guessed": it does not, and
   * `firstIsLong` is the side that looks longer on screen. "square": both
   * sides are the same length, so there is nothing to settle. */
  how: "picture" | "guessed" | "square";
  /** The on-screen guess: true when corner 0 to 1 looks the longer. */
  looks: boolean;
};

/** The rule, in tap variances (a fit's squared misses summed over the four
 * corners, divided by the squared tap uncertainty). The picture settles the
 * long side when the worse fit's miss exceeds the better one's by more than
 * `CLEAR_GAP` and the better one's is under `FIT_LIMIT` (it is a camera that
 * could have taken the picture). Set from 20,000 seeded hand-built cameras
 * with taps 1.5 px off (tests/ruler-long-side.test.ts repeats a part of it):
 * at a gap of 6 the picture's choice was wrong 28 times, at 9 four times, at
 * 12 and at 16 never. 16 is used for the room it leaves when taps are worse
 * than assumed: with taps 3 px off and 1.5 assumed, 0.8% of choices were
 * wrong at 16 against 1.4% at 12. */
export const CLEAR_GAP = 16,
  FIT_LIMIT = 9;

/** The squared miss, in source pixels, of the best camera for the reference
 * laid `a` mm along corner 0 to 1 and `b` mm along corner 1 to 2. */
function miss(
  ordered: Pt[],
  a: number,
  b: number,
  size: { w: number; h: number },
): number {
  const plane = [
      { x: 0, y: 0 },
      { x: a, y: 0 },
      { x: a, y: b },
      { x: 0, y: b },
    ],
    h = solveHomography(ordered, plane),
    camera =
      h &&
      fitCamera({
        h,
        width: size.w,
        height: size.h,
        seen: ordered.map((image, i) => ({ plane: plane[i], image })),
      });
  // Two residuals a corner; `rms` is over all eight.
  return camera ? camera.rms * camera.rms * 8 : Infinity;
}

const cache = new Map<string, LongSide>(),
  CACHE_SIZE = 32;

/** Decide the long side of four ordered corners (source pixels, after any
 * lens correction) of a reference `long` by `short` mm. `sigma` is the tap
 * uncertainty, one sd in source pixels. Without the picture's size there is
 * no camera to fit, so the answer is the on-screen guess. Remembered by
 * content: the same corners are not fitted twice. */
export function chooseLongSide(
  ordered: Pt[],
  long: number,
  short: number,
  size: { w: number; h: number } | null,
  sigma: number,
): LongSide {
  const looks = looksLong(ordered),
    guess: LongSide = { firstIsLong: looks, how: "guessed", looks };
  if (long === short) return { ...guess, how: "square" };
  if (ordered.length !== 4 || !size || !(sigma > 0)) return guess;
  const key = [
      ordered.map((p) => `${p.x},${p.y}`).join(";"),
      long,
      short,
      size.w,
      size.h,
      sigma,
    ].join("#"),
    known = cache.get(key);
  if (known) return known;
  const first = miss(ordered, long, short, size) / (sigma * sigma),
    second = miss(ordered, short, long, size) / (sigma * sigma),
    clear =
      Math.abs(first - second) > CLEAR_GAP &&
      Math.min(first, second) < FIT_LIMIT,
    value: LongSide = clear
      ? { firstIsLong: first < second, how: "picture", looks }
      : guess;
  if (cache.size >= CACHE_SIZE)
    cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}

/** What the panel says beside the reference about its long side, or null
 * when the picture settles it the way it looks and nothing was swapped. */
export function longSideNote(
  side: LongSide | null,
  swap: boolean,
): string | null {
  if (!side || side.how === "square") return null;
  const check = "Check the lengths on the reference's edges in the picture";
  if (side.how === "guessed")
    return `The long side of the reference was guessed from how it looks: this picture does not settle it. ${check}; if they are the wrong way round, press Swap sides.`;
  if (swap)
    return `Swap sides is on, and the picture disagrees: its perspective fits the reference the other way round. Your choice is kept. ${check}.`;
  // The picture overrules the look. A cropped picture is the one thing that
  // can mislead the camera fit, so this choice is always said out loud.
  return side.firstIsLong !== side.looks
    ? `The long side of the reference is the one that looks shorter here, because the camera looks along it. A cropped picture can mislead this. ${check}; if they are the wrong way round, press Swap sides.`
    : null;
}
