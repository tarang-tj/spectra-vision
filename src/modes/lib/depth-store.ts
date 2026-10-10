/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the user chose in the Depth mode: the flat map or the 3D view, how
// strongly the map covers the picture, and how far the 3D view is turned.
// Module level, kept for the page session. The object is replaced, never
// mutated, so useSyncExternalStore can compare it.
import { PITCH_LIMIT, YAW_LIMIT } from "../../vision/depth/orbit";

export type DepthView = {
  view: "map" | "cloud";
  /** 0 shows the picture alone, 1 the depth map alone. */
  opacity: number;
  /** Degrees. */
  yaw: number;
  pitch: number;
};

/** One press of a turn button or an arrow key, in degrees. */
export const TURN_STEP = 10;

const initial: DepthView = { view: "map", opacity: 0.85, yaw: 0, pitch: 0 };
let state = initial;
const listeners = new Set<() => void>();
const clamp = (value: number, limit: number) =>
  Math.min(limit, Math.max(-limit, value));

export const getDepthView = () => state;
export const onDepthView = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export function setDepthView(patch: Partial<DepthView>) {
  const next = { ...state, ...patch };
  next.opacity = Math.min(1, Math.max(0, next.opacity));
  next.yaw = clamp(next.yaw, YAW_LIMIT);
  next.pitch = clamp(next.pitch, PITCH_LIMIT);
  if (
    next.view === state.view &&
    next.opacity === state.opacity &&
    next.yaw === state.yaw &&
    next.pitch === state.pitch
  )
    return;
  state = next;
  listeners.forEach((listener) => listener());
}
export const turnView = (yaw: number, pitch: number) =>
  setDepthView({ yaw: state.yaw + yaw, pitch: state.pitch + pitch });
export const resetTurn = () => setDepthView({ yaw: 0, pitch: 0 });
/** Back to the first state (tests). */
export const resetDepthView = () => setDepthView(initial);
