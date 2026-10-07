/** A mode id. Modes are discovered at build time from src/modes, so this is a
 * string checked against the registry rather than a hardcoded union. */
export type Mode = string;
export type Point = { x: number; y: number; z?: number; visibility?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Detection = { label: string; score: number; box: Box };
/** What a vision worker can run. Only object, pose and hand are implemented;
 * the other three are reserved for the models lane (see public/vision-worker.js). */
export type TaskKind =
  | "object"
  | "pose"
  | "hand"
  | "face"
  | "segment"
  | "gesture";
export type Delegate = "CPU" | "GPU";
/** One model to run. `model` is a file name under public/models (listed in
 * scripts/models.json); `options` are passed to the MediaPipe task as is. */
export type TaskSpec = {
  kind: TaskKind;
  model: string;
  options: Record<string, unknown>;
  delegate: Delegate;
};
/** Normalized output of one task for one frame. `delegate` is the one that
 * actually ran, which differs from the requested one after a GPU fallback. */
export type TaskResult = {
  kind: TaskKind;
  generation: number;
  time: number;
  latency: number;
  delegate: Delegate;
  detections: Detection[];
  landmarks: Point[][];
  handedness: string[];
  /** Kind-specific payload (blendshapes, masks, gesture names) added by later kinds. */
  extra?: Record<string, unknown>;
};
/** Latest results of every task of the current mode. The flat fields mirror the
 * mode's first (primary) task so v1 drawing, exports and tests keep working. */
export type VisionResult = {
  mode: Mode;
  generation: number;
  time: number;
  latency: number;
  detections: Detection[];
  landmarks: Point[][];
  handedness: string[];
  tasks: Partial<Record<TaskKind, TaskResult>>;
};
export type Track = Detection & {
  id: number;
  lastSeen: number;
  trail: Point[];
};
export type Source = {
  element: HTMLImageElement | HTMLVideoElement;
  kind: "demo" | "image" | "video" | "camera";
  label: string;
  generation: number;
};
export const COLORS = ["#a4ffd9", "#67aaff", "#ae94fa", "#ffd18d", "#ff8ab4"];
