import { createContext, useContext } from "react";
import type { InspectorRow, ModeDef } from "./modes";
import type { FrameData } from "./vision/frame";

/** Everything a panel may read or change. Panels take no props; they call
 * useStudio(), so a new panel never needs an edit to a shared component. */
export type Studio = {
  mode: ModeDef;
  setMode(id: string): void;
  /** Latest result, tracks, source and settings (the canvas-free frame state). */
  frame: FrameData;
  /** The current mode's inspector rows for this frame. */
  rows: InspectorRow[];
  /** How many things the mode is following in this frame ("Tracked"). */
  count: number;
  paused: boolean;
  /** "Ready", or what the stage is waiting for. */
  status: string;
  setConfidence(value: number): void;
  toggleEffect(id: string): void;
  select(id: number | null): void;
  motionDemo: boolean;
  toggleMotionDemo(): void;
  notice(text: string): void;
  /** Id of the inspector panel on show, or null for the first one. */
  panel: string | null;
  /** Show a panel by id (a tab click or the command palette). */
  openPanel(id: string): void;
  /** True in the stage-only view, where the rail and the page chrome are hidden. */
  immersive: boolean;
};

export const StudioContext = createContext<Studio | null>(null);

export function useStudio(): Studio {
  const studio = useContext(StudioContext);
  if (!studio) throw new Error("useStudio must be used inside the app shell.");
  return studio;
}
