/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// `window.__spectraDepth`, only on a page opened with `?spectra-test`: a
// read-only view of the latest depth result drawn, for the browser tests.
import { testHooksEnabled } from "../../test-hooks";
import type { DepthExtra, TaskResult } from "../../vision/types";
import { cloudHeld } from "./depth-session";

type Drawn = {
  task: TaskResult;
  extra: DepthExtra;
  /** Points in the 3D view (0 in the map view). */
  points: number;
  /** Which picture the map was drawn over (depth-sync.ts). */
  over: string;
  /** The legend's line about that, or "". */
  lag: string;
};
let drawn: Drawn | null = null;

/** Called by the mode after each draw. */
export const noteDrawn = (next: Drawn) => {
  drawn = next;
};

if (typeof window !== "undefined" && testHooksEnabled())
  Object.assign(window, {
    __spectraDepth: {
      last: () =>
        drawn && {
          width: drawn.extra.width,
          height: drawn.extra.height,
          min: drawn.extra.min,
          max: drawn.extra.max,
          delegate: drawn.task.delegate,
          latency: drawn.task.latency,
          points: drawn.points,
          // The cells that are picture (null: all of them).
          content: drawn.extra.content ?? null,
          over: drawn.over,
          lag: drawn.lag,
        },
      /** The map's value at an image-normalized point. */
      at: (x: number, y: number) =>
        drawn
          ? drawn.extra.values[
              Math.floor(y * drawn.extra.height) * drawn.extra.width +
                Math.floor(x * drawn.extra.width)
            ]
          : null,
      cloudHeld,
    },
  });
