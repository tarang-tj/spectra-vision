import { isRecord } from "../registry";
import type { Frame, FrameData } from "../vision/frame";
import type { Point, TaskSpec } from "../vision/types";

/** One row of the inspector's "In the frame" list and one dot on the motion map. */
export type InspectorRow = {
  key: number;
  label: string;
  detail: string;
  point: Point;
  color: string;
};
/** Demo inputs, as paths under public/. They stay labelled as demos in the UI. */
export type DemoSpec = { still: string; motion?: string; label: string };
export type ModeDef = {
  id: string;
  /** Long name: stage badge and canvas label, for example "Object detection". */
  label: string;
  /** Short name on the mode switch, for example "Objects". */
  short: string;
  order: number;
  /** One model, or several for a fusion mode (one worker each). The first task
   * is the primary one: it fills the flat VisionResult fields. */
  task: TaskSpec | TaskSpec[];
  hint: string;
  demo: DemoSpec;
  /** Show the stage's Clear tool, which resets effect state such as painted trails. */
  clearable?: boolean;
  /** Draw the mode's own geometry over the source image. Runs every frame. */
  drawBase(ctx: CanvasRenderingContext2D, frame: Frame): void;
  /** Rows for the inspector. The row count is also the "Tracked" metric. */
  inspector(frame: FrameData): InspectorRow[];
};

export function isMode(value: unknown): value is ModeDef {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.short === "string" &&
    typeof value.order === "number" &&
    isRecord(value.task) &&
    typeof value.hint === "string" &&
    isRecord(value.demo) &&
    typeof value.drawBase === "function" &&
    typeof value.inspector === "function"
  );
}

/** A mode's tasks as a list; the first is the primary one. */
export const tasksOf = (mode: ModeDef): TaskSpec[] =>
  Array.isArray(mode.task) ? mode.task : [mode.task];
