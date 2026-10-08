/** A mode id. Modes are discovered at build time from src/modes, so this is a
 * string checked against the registry rather than a hardcoded union. */
export type Mode = string;
export type Point = { x: number; y: number; z?: number; visibility?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Detection = {
  label: string;
  score: number;
  box: Box;
  /** Segment classes only: the fraction of mask pixels the class owns. */
  share?: number;
  /** Segment classes only: the number of mask pixels the class owns. */
  pixels?: number;
};
/** What a vision worker can run (see the kind switch in public/vision-worker.js). */
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
/** `extra` of a "face" result. One entry per face, in the order of `landmarks`.
 * `blendshapes` maps every MediaPipe blendshape name to its score (0..1);
 * `matrices` holds the 4x4 facial transformation matrix, column-major. */
export type FaceExtra = {
  blendshapes: Record<string, number>[];
  matrices: number[][];
};
/** `extra` of a "gesture" result: the top gesture of every hand, in the order
 * of `landmarks`. `name` is the model's category name ("None" when it sees none). */
export type GestureExtra = {
  gestures: { name: string; score: number; handedness: string }[];
};
/** One class of the segmenter, measured over one mask. `score` is the model's
 * mean confidence over the pixels the class won; `box` is image-normalized. */
export type SegmentClass = {
  label: string;
  pixels: number;
  share: number;
  score: number;
  box: Box;
};
/** `extra` of a "segment" result. Both masks are `width * height` bytes, row by
 * row from the top left, in image-normalized space (not mirrored):
 * `mask[i]` is the index into `classes` of the winning class, `alpha[i]` is the
 * model's confidence that the pixel is not background, scaled to 0..255. */
export type SegmentExtra = {
  width: number;
  height: number;
  /** Index of the background class in `classes`. */
  background: number;
  mask: Uint8Array;
  alpha: Uint8Array;
  classes: SegmentClass[];
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
