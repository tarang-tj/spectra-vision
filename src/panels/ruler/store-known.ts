/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Editing the further known sizes: more references on the same surface, the
// tape reading typed beside a span, and whether that reading is used as a
// known size. The state itself lives in state.ts.
import type { Pt } from "./homography";
import type { Reference } from "./references";
import { getState, set, type Handle, type RulerState } from "./state";

/** Start a further reference of this size: the next four taps are its
 * corners. One at a time; taps then place spans again. */
export function addReference(ref: Reference) {
  const s = getState();
  if (s.corners.length < 4 || s.extraRefs.some((r) => r.corners.length < 4))
    return;
  set({
    tool: "span",
    shapes: s.shapes.filter((x) => x.done),
    extraRefs: [
      ...s.extraRefs,
      { label: ref.label, long: ref.long, short: ref.short, corners: [] },
    ],
  });
}
export const removeReference = (r: number) =>
  set({ extraRefs: getState().extraRefs.filter((_, i) => i !== r) });

/** The further reference still short of four corners, or -1. */
export const pendingRef = (s: RulerState) =>
  s.extraRefs.findIndex((r) => r.corners.length < 4);

export function placeRefCorner(at: Pt): Handle | null {
  const s = getState(),
    r = pendingRef(s);
  if (r < 0) return null;
  const extraRefs = s.extraRefs.slice(),
    i = extraRefs[r].corners.length;
  extraRefs[r] = { ...extraRefs[r], corners: [...extraRefs[r].corners, at] };
  set({ extraRefs });
  return { kind: "ref", r, i };
}

export function moveRefCorner(h: { r: number; i: number }, at: Pt) {
  const s = getState(),
    ref = s.extraRefs[h.r];
  if (!ref || !ref.corners[h.i]) return;
  const extraRefs = s.extraRefs.slice(),
    corners = ref.corners.slice();
  corners[h.i] = at;
  extraRefs[h.r] = { ...ref, corners };
  set({ extraRefs });
}

export const refCorners = (s: RulerState) =>
  s.extraRefs.flatMap((ref, r) => ref.corners.map((p, i) => ({ p, r, i })));

/** Take back the last corner of the reference being tapped (or the whole
 * reference when it has none). False when none is being tapped. */
export function undoRefCorner(): boolean {
  const s = getState(),
    r = pendingRef(s);
  if (r < 0) return false;
  const ref = s.extraRefs[r],
    extraRefs = s.extraRefs.slice();
  if (ref.corners.length)
    extraRefs[r] = { ...ref, corners: ref.corners.slice(0, -1) };
  else extraRefs.splice(r, 1);
  set({ extraRefs });
  return true;
}

function patchMeasure(m: number, patch: Partial<RulerState["measures"][0]>) {
  const s = getState();
  if (!s.measures[m]) return;
  const measures = s.measures.slice();
  measures[m] = { ...measures[m], ...patch };
  set({ measures });
}
/** What a tape measure read for span `m`, as typed, in the unit now shown.
 * Clearing it also stops using it as a known span. */
export const setTape = (m: number, tape: string) =>
  patchMeasure(
    m,
    tape.trim()
      ? { tape, tapeUnit: getState().unit }
      : { tape: undefined, tapeUnit: undefined, known: false },
  );
/** Use the typed tape length of span `m` as a known size, or stop. */
export const setKnown = (m: number, known: boolean) =>
  patchMeasure(m, { known });
export const setTapeSd = (tapeSd: string) => set({ tapeSd });
