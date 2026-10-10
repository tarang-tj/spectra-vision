/** A mode id. Modes are discovered at build time from src/modes, so this is a
 * string checked against the registry rather than a hardcoded union. */
export type Mode = string;
export type Point = { x: number; y: number; z?: number; visibility?: number };
export type Box = { x: number; y: number; w: number; h: number };
export type Detection = {
  label: string;
  score: number;
  box: Box;
  /** Objects with Finer names on: the image classifier's name for this box and
   * its own score, present only when that score reached the floor. Never
   * replaces `label` and `score`, which are the detector's. */
  finer?: { label: string; score: number };
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
  | "gesture"
  | "depth";
/** The delegate a worker really runs on. */
export type Delegate = "CPU" | "GPU";
/** What a task may ask for. "AUTO" means GPU where this page has a real
 * hardware WebGL2 renderer and CPU everywhere else (vision/delegate.ts). */
export type DelegateRequest = Delegate | "AUTO";
/** Options that may change while a task runs. The runner applies them to the
 * live worker (MediaPipe `setOptions`) without loading the model again. */
export type LiveOptions = {
  current(): Record<string, unknown>;
  subscribe(listener: () => void): () => void;
};
/** One model to run. `model` is a file name under public/models (listed in
 * scripts/models.json); `options` are passed to the MediaPipe task as is. */
export type TaskSpec = {
  kind: TaskKind;
  model: string;
  /** A slower, more accurate model for the same task, loaded instead of
   * `model` while the Precision setting is "Precise". Listed in
   * scripts/models.json like any other model. */
  preciseModel?: string;
  options: Record<string, unknown>;
  /** Options that win over `options` and can change while the task runs. */
  live?: LiveOptions;
  delegate: DelegateRequest;
};
/** Normalized output of one task for one frame. `delegate` is the one that
 * actually ran, which differs from the requested one after a GPU fallback. */
export type TaskResult = {
  kind: TaskKind;
  generation: number;
  time: number;
  latency: number;
  delegate: Delegate;
  /** The model file this result came from (set by the task runner). */
  model?: string;
  detections: Detection[];
  landmarks: Point[][];
  handedness: string[];
  /** Kind-specific payload (blendshapes, masks, gesture names) added by later kinds. */
  extra?: Record<string, unknown>;
};
/** `extra.finer` of an "object" result while Finer names is on. `floor` is the
 * lowest classifier score that is ever shown; `classified` is how many crops
 * were classified for this frame and `ms` what that took in the worker. */
export type FinerExtra = {
  state: "loading" | "ready" | "failed";
  floor: number;
  ms: number;
  classified: number;
  note?: string;
};
/** `extra` of a "pose" or "hand" result: MediaPipe's world landmarks, one list
 * per body or hand and indexed exactly like `landmarks`. Units are metres. The
 * origin is the hip midpoint for a pose and the hand's geometric centre for a
 * hand, so the points give sizes and angles, not a position in the room. `x`,
 * `y` and `z` are real-world offsets (y down, as in the image); `visibility`
 * is present on pose points. Always an array, empty when nothing was seen. */
export type WorldExtra = {
  world: Point[][];
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
/** `extra` of a "depth" result (public/depth-worker.js). `values` is the
 * model's output, `width * height` numbers row by row from the top left, in
 * image space (not mirrored). It is affine-invariant inverse depth: a larger
 * value is nearer, and neither the scale nor the zero is known, so a value is
 * not a length. `min` and `max` are the smallest and largest value. The map's
 * size is also the size the picture was resized to for the model. */
export type DepthExtra = {
  width: number;
  height: number;
  values: Float32Array;
  min: number;
  max: number;
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
