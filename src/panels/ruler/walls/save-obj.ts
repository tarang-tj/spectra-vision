/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What Save OBJ writes: the shell the 3D view draws, never more. When the
// mean height is too uncertain to draw, the view shows the floor alone, and a
// file with walls at that height would pass a guess off as a measurement.
import type { Current } from "./current";
import { meshObj } from "./mesh";

/** Why the 3D view and the OBJ hold the floor alone, or null when they hold
 * the whole shell. `vague`: the height's bar is as large as the height. */
export function floorOnly(
  cur: Pick<Current, "preview">,
  vague: boolean,
): "uncertain" | "unmeasured" | null {
  if (vague) return "uncertain";
  return cur.preview?.faces.length === 1 ? "unmeasured" : null;
}

const HEADER = {
  uncertain:
    "Floor only: the heights are too uncertain to write as walls. The CSV has them with their bars.",
  unmeasured: "Floor only: no height was measured.",
};

/** The OBJ text, or null while the room is not closed. */
export function roomObj(
  cur: Pick<Current, "preview" | "basis">,
  vague: boolean,
): string | null {
  if (!cur.preview) return null;
  const why = floorOnly(cur, vague);
  return meshObj(cur.preview, `${why ? `${HEADER[why]}\n` : ""}${cur.basis}`);
}
