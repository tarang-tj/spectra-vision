# SPECTRA architecture (v2)

SPECTRA is built from three registries. Each one is a folder that is scanned at build time with `import.meta.glob`, so **adding one file adds one entry**. Nothing else needs editing: no list, no switch, no shared stylesheet.

| Registry | Folder         | A plugin file exports | Shows up as                         | Shipped                                                                                                          |
| -------- | -------------- | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Modes    | `src/modes/`   | `ModeDef`             | A button on the mode switch         | Objects, Body, Hands, Face, Segment, Gestures, Fusion, Depth                                                     |
| Effects  | `src/effects/` | `EffectDef`           | A switch in the effects tray        | Trails, Constellation, Plasma hands, Ember trail, Neon ribbons, Aura, Hologram, Starfield pull, Echo, Face light |
| Panels   | `src/panels/`  | `PanelDef`            | A tab in the inspector (right rail) | Inspect, Lab, Library, Ruler, Presence                                                                           |

Visual and interaction design is specified in [design/implementation-spec.md](design/implementation-spec.md). This file covers structure only.

## Rules every plugin must obey

These are binding. A plugin that breaks one does not merge.

1. **Real inference only.** Nothing may render a detection, landmark, score or metric that a model or a clock did not produce. Demo inputs stay labelled as demos.
2. **Privacy copy stays true.** Nothing leaves the browser: no uploads, no analytics, no remote calls with user media or results.
3. **Models load on demand** for the selected mode, never at startup.
4. **One in-flight bitmap per worker.** Stale generations are discarded. Tracks and object URLs are released when the source changes.
5. **No always-on work when paused or when the tab is hidden.** Effects stop with the stage: do not start your own `requestAnimationFrame`, timer or worker loop. Draw only when the stage calls you.
6. **Accessible names on every control, visible focus, reduced motion respected** (`frame.animate` is false when it applies).
7. **Prettier formatting is part of the gate.**
8. **A result belongs to one mode and one source.** No mode's `drawBase`, `inspector`, `count` or `exportFrame`, and no effect, is ever handed a result that another mode, task set or source produced. `useVision` returns a result only when its `mode` and `generation` match the current ones, and `useSession` keys tracks and the frame rate the same way, so a plugin does not have to defend against a 21-point hand where it expects a 33-point body.

## The gate

Run in this order. Every command must exit 0. A bundler build alone is not the gate: `check` and `format:check` fail independently of it.

```
pnpm install --frozen-lockfile
pnpm run setup
pnpm run format:check
pnpm run check
pnpm run test
PAGES_BUILD=1 pnpm run build
SPECTRA_TEST_PRODUCTION=1 pnpm run test:e2e
```

## How registries discover files

`src/registry.ts` exports `collect(modules, isValid, kind)`. Each registry's `index.ts` passes it an eager glob of its own folder and exports the sorted result.

- A file's **default export** is the definition. Entries sort by `order` (default 100), then by `id`.
- A file whose default export is not a valid definition, or whose `id` is already taken, is skipped and reported with `console.warn`. `tests/registry.test.ts` fails if any shipped registry has such a problem, so the gate catches it.
- In `src/modes` and `src/effects`, **every `.ts` file except `index.ts` and `types.ts` is a plugin**. In `src/panels`, every `.tsx` file is a plugin. Put shared helpers in a subfolder (`src/modes/lib/`, `src/effects/lib/`, `src/panels/lab/`) or in `src/vision/`.
- **Import from `./types`, never from `./index`, inside a plugin file.** `index.ts` imports the plugin files, so a value imported back from it does not exist yet when the plugin loads, and the app fails to start. Importing another registry's index (an effect type reading `ModeDef` from `../modes`) is fine.
- A plugin may import its own stylesheet (`import "./my-panel.css"`). The shared files under `src/styles/` are not edited by plugins.

## Frame state

`src/vision/frame.ts`. One object is handed to everything that draws.

```ts
type FrameData = {
  result: VisionResult | null; // latest merged model output
  tracks: Track[]; // object tracks with ids and trails; empty unless the mode sets `tracked`
  mirror: boolean;
  settings: {
    confidence: number;
    selected: number | null;
    effects: Readonly<Record<string, boolean>>;
  };
  source: Source | null;
  aspect: number; // source width / height
};
type Frame = FrameData & {
  time: number; // requestAnimationFrame timestamp, ms
  dt: number; // ms since the previous drawn frame; 0 on the first frame and while paused
  paused: boolean;
  animate: boolean; // false while paused or when reduced motion is requested
  width: number; // canvas size in CSS pixels (drawing units)
  height: number;
  dpr: number; // backing-store pixels per CSS pixel
  rect: { x: number; y: number; w: number; h: number }; // letterboxed source image
  project(point: Point): { x: number; y: number }; // image-normalized 0..1 to canvas pixels, mirror aware
  emit(slot: "before" | "after", kind: TaskKind, index: number): void;
};
```

- The stage owns **one** `Frame` and mutates it in place every frame. Never keep a reference across frames, and never use its identity to detect change. To detect a new model result, compare `frame.result` with the last one you saw: it is a new object per result.
- `FrameData` is the part that does not depend on the canvas. The inspector and panels get it through `useStudio().frame`.
- `frame.emit` is how a mode lets effects draw between its items. See "Draw order".

## Draw order

`src/stage/renderer.ts` draws one frame, at most about 30 times a second, in this order:

1. Background and the source image (mirrored if asked).
2. `effect.under(frame)` for every effect that is on.
3. `mode.drawBase(ctx, frame)`. Around each item it draws, the mode calls `frame.emit("before" | "after", kind, index)`, which runs the matching `effect.before` / `effect.after`.
4. `effect.draw(frame)` for every `"2d"` effect that is on.
5. The WebGL layer is cleared, every `"gl"` effect that is on draws into it, and it is copied onto the main canvas.

Everything ends up on the one main 2D canvas, so Record and Screenshot capture effects with no further work. Nothing is drawn when there is no source. A mode whose `drawBase` throws is logged once and skipped for that frame; the stage keeps running.

## Modes

`src/modes/types.ts`

```ts
type ModeDef = {
  id: string;
  label: string; // "Object detection": stage badge and canvas label
  short: string; // "Objects": mode switch
  order: number;
  task: TaskSpec | TaskSpec[]; // several = fusion, one worker each; the first is primary
  hint: string; // tip under the inspector
  demo: { still: string; motion?: string; label: string }; // paths under public/
  clearable?: boolean; // show the stage's Clear tool
  drawBase(ctx: CanvasRenderingContext2D, frame: Frame): void;
  inspector(frame: FrameData): InspectorRow[];
  count?(frame: FrameData): number; // the "Tracked" metric; defaults to the row count
  tracked?: boolean; // give detections track ids and trails (Objects only)
  exportFrame?(result: VisionResult): Record<string, unknown>; // extra keys for the session export
};
type InspectorRow = {
  key: number;
  label: string;
  detail: string;
  point: Point;
  color: string;
};
```

Adding a mode, `src/modes/face.ts`:

```ts
import type { ModeDef } from "./types";
const face: ModeDef = {
  id: "face",
  label: "Face mesh",
  short: "Face",
  order: 40,
  task: {
    kind: "face",
    model: "face_landmarker.task",
    options: { numFaces: 1 },
    delegate: "CPU",
  },
  hint: "Face the camera.",
  demo: { still: "demo/studio.png", label: "Demo studio" },
  drawBase(ctx, frame) {
    for (const p of frame.result?.tasks.face?.landmarks[0] ?? []) {
      const q = frame.project(p);
      ctx.fillRect(q.x, q.y, 1, 1);
    }
  },
  inspector: () => [],
};
export default face;
```

The model file must be listed in `scripts/models.json` with its SHA-256, and the task kind must be implemented in the worker.

- **`count`.** The footer's Tracked figure and the inspector heading show how many things the mode follows, not how many rows it lists. Face returns the number of faces (its rows are meters), Gestures the number of hands (its rows include a log), Segment the classes found without the background. The other modes use the default.
- **`tracked`.** Only Objects sets it. Its detections go through the tracker (`src/vision/tracker.ts`) and come back as `frame.tracks` with ids and trails, which the motion map draws. Gestures and Segment also report detections (a hand box, a class box), but those are not separate objects, so they get no track ids and no trails.
- **`exportFrame`.** Each processed frame is stored for the session export with the five v1 keys (`elapsedMs`, `latencyMs`, `detections`, `landmarks`, `handedness`). A mode may add optional keys; it cannot replace a v1 key. Face adds `face` (blendshapes, head pose), Gestures `gestures`, Segment `segmentation` (class shares), Fusion `tasks` (each model's own result). The README documents the fields.
- **Demo.** A mode with no `demo.motion` clip gets no motion demo button.

## Vision tasks and the worker protocol

`src/vision/types.ts`, `public/vision-worker.js`, `src/vision/task-runner.ts`, `src/vision/useVision.ts`.

```ts
type TaskKind =
  | "object"
  | "pose"
  | "hand"
  | "face"
  | "segment"
  | "gesture"
  | "depth";
type TaskSpec = {
  kind: TaskKind;
  model: string;
  preciseModel?: string; // loaded instead of `model` while Precision is "Precise"
  options: Record<string, unknown>;
  delegate: "CPU" | "GPU";
};
type TaskResult = {
  kind: TaskKind;
  generation: number;
  time: number;
  latency: number;
  delegate: "CPU" | "GPU"; // the delegate that actually ran
  model?: string; // the model file that ran (set by the task runner)
  detections: Detection[];
  landmarks: Point[][];
  handedness: string[];
  extra?: Record<string, unknown>; // kind-specific payload
};
type VisionResult = {
  mode: string;
  generation: number;
  time: number;
  latency: number;
  detections: Detection[];
  landmarks: Point[][];
  handedness: string[]; // from the primary task
  tasks: Partial<Record<TaskKind, TaskResult>>; // latest result of every task
};
```

`model` is a file name under `public/models/`. `options` are passed to the MediaPipe task unchanged; the `depth` kind is not a MediaPipe task and reads its own (`size: { CPU, GPU }`, the side the picture is resized toward).

One worker runs one task. The six MediaPipe kinds run in `public/vision-worker.js`; `depth` runs in `public/depth-worker.js`, which the task runner spawns instead and which speaks the same messages plus `progress`. Messages:

| Direction | Message                                                   | Meaning                                                              |
| --------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| to worker | `{ type: "init", base, task: TaskSpec }`                  | Load the runtime and the model                                       |
| from      | `{ type: "progress", loaded, total }`                     | Depth only: a long download is still arriving (sent about every 5 s) |
| from      | `{ type: "downloaded" }`                                  | The model and wasm bytes have arrived                                |
| from      | `{ type: "ready", delegate }`                             | The task is loaded                                                   |
| to worker | `{ type: "frame", bitmap, time, generation, confidence }` | Run on one transferred bitmap                                        |
| from      | `{ type: "result", result: TaskResult }`                  | Output for that frame; the bitmap is closed                          |
| from      | `{ type: "error", error }`                                | Load or inference failed                                             |

- **The six MediaPipe kinds are implemented** in the single `handlerFor(kind)` switch in `vision-worker.js`. That switch is the one place to add a kind: return `create`, `run`, `confidence` and `read`. `face` puts blendshapes and matrices in `extra`, `gesture` the top gesture of each hand, `segment` two 256 x 256 byte masks and per-class measurements (typed as `FaceExtra`, `GestureExtra`, `SegmentExtra`; read them with the helpers in `src/modes/lib/task-extras.ts`).
- The `ready` message also lists the files the worker fetched from the site (runtime, wasm, model). The page passes them to the service worker; see "Offline".
- **Depth.** `depth-worker.js` loads ONNX Runtime Web from `runtime/ort-<version>/` and one model, Depth Anything V2 Small. `"CPU"` is the WebAssembly execution provider and `"GPU"` the WebGPU one. It resizes the bitmap by the model's own preprocessing rule (each side a multiple of the 14 pixel patch, the longer side capped at twice the target) and puts the output in `extra` as `DepthExtra`: `width`, `height`, `values` (a `Float32Array`, row by row), `min`, `max`. The values are relative inverse depth, larger for nearer, with unknown scale and zero; nothing in the worker turns them into a length. A `progress` message from a task that is not ready yet calls `RunnerEvents.onRestart`, which restarts the page's 45 s load timeout, so a slow download of the 99 MB model is not treated as a failure. A GPU start that fails is not retried in the worker: the runner restarts it on CPU under the delegate rules below. A lost WebGPU device is posted as an error.
- **Fusion.** A mode with several tasks gets one worker per task, each fed its own bitmap. `mergeResults` (`src/vision/merge.ts`) keeps the latest result of every task under `result.tasks`, drops results from an older source generation, takes the flat fields and `time` from the primary (first) task, and reports `latency` as the slowest task. The app counts a frame (FPS, tracker, session history) only when the primary task's time advances.
- **Status.** `useVision` reads its status from the runners: it is "Ready" only while every task of the mode is loaded. A runner that starts again (a delegate switch, a GPU to CPU fallback) reports it through `RunnerEvents.onRestart`, and the stage shows "Loading model" until it is ready again.

### Delegates

`src/vision/delegate.ts`, `src/vision/task-runner.ts`, `src/vision/webgl-probe.ts`.

A task asks for `"CPU"` or `"GPU"` in its `TaskSpec`. The three v1 modes, Face, Gestures and Fusion ask for CPU. Segment asks for GPU, where its model is several times faster. Depth asks for `"AUTO"`; for that kind GPU means WebGPU, and a browser without it falls back to CPU with the reason shown.

- **Choice store.** The Lab's CPU or GPU switch calls `chooseDelegate(kind, delegate)`. The choice is kept per task kind for the page's lifetime, `requestedDelegate(spec)` returns the choice or else the mode's own delegate, and every runner of that kind restarts on it (`onDelegateChoice`). `chooseDelegate(kind, null)` gives the decision back to the mode.
- **Software-renderer refusal.** Before a GPU task starts, `gpuUnavailable()` asks the page's one WebGL probe for the renderer name. With no WebGL2, or with a software renderer (SwiftShader, llvmpipe, lavapipe, WARP, Mesa OffScreen, Generic Renderer, Basic Render Driver), GPU is refused up front and the task runs on CPU with the reason recorded. `"AUTO"` uses the same name check, so those renderers resolve to CPU there too. A software renderer can run the GPU path, but an abandoned start there was measured to keep the browser's GPU process busy for 16 seconds to minutes. The worker refuses a software renderer for `segment` on its own as well.
- **Fallback on error.** A GPU task that fails is restarted once on CPU (`fallbackDelegate`), whether or not it had already produced results. A task that worked and then failed (a lost context, a driver reset, a tab moved to another GPU) says so in its status note: "GPU stopped working (reason). Now running on CPU." There is no loop: the restarted task is on CPU, a CPU failure is a real error, and a runner that fell back never returns to GPU by itself.
- **GPU failure memory.** Each fallback records the reason per task kind for the page session (`rememberGpuFailure`). While a failure is on record, a new runner of that kind that would have started on GPU, from `"AUTO"` or from the mode's own GPU request, starts on CPU and its note says GPU failed earlier on this page. Choosing GPU in the Lab clears the record and restarts that kind's runners on GPU, including a runner that is already on CPU because of the failure and a choice of GPU that was already made. If GPU fails again, the same rules apply. The Lab's "what is really running" line reads the status note, so it names the failure in each of these states.
- **Time bounds.** A GPU task that hangs posts no error, so the start is bounded: `GPU_READY_LIMIT_MS` (8 s, from the worker's "downloaded" message to "ready"; the worker fetches the model and the wasm itself and says when the bytes are in, so a slow connection is not counted against the GPU) and `GPU_FIRST_RESULT_LIMIT_MS` (5 s from the first frame sent to the first result). Past either, `gpuStartTimeout` gives the reason and the runner restarts on CPU. The check runs on a 250 ms timer only while a GPU task is loading or owes its first result. The decision is bounded; how fast CPU then recovers on a renderer slow enough to trigger it is not.
- The delegate in use is on every `TaskResult` and on the `model` telemetry event, with a `note` saying why it differs from the one requested.

### A lost GPU

When the browser's graphics process ends or the GPU is reset, MediaPipe's GPU task does not throw: it goes on returning empty results, so a mode would show nothing while the Lab still said "Running on GPU". The worker therefore holds one WebGL2 context of its own while a GPU task runs and checks `isContextLost()` before every frame; a lost context is posted as an error, and the runner restarts the task on CPU with a note. `scripts/gpu-loss-check.mjs` is the manual check: it opens the app in system Chrome on the real GPU, ends that browser's graphics process and reports whether the mode fell back and kept finding things. CI has no GPU, so there the path is covered by `tests/modes-worker-gpu-loss.test.ts` with a stand-in context.

### WebGL probe

`probeWebgl()` opens one throwaway 1 x 1 WebGL2 context, reads the renderer name, releases the context and keeps the answer. The delegate refusal and the effects tray both use it, so the page asks once. When the browser has no WebGL2 it logs one `console.warn`; nothing in that path logs an error.

## Effects

`src/effects/types.ts`

```ts
type EffectDef = {
  id: string;
  label: string; // switch text and accessible name
  modes: string[] | "*";
  kind: "2d" | "gl";
  order?: number; // picker and draw order, default 100
  defaultOn?: boolean;
  intensity?: { default: number }; // has a strength control, 0..1
  create(env: EffectEnv): EffectInstance; // first time it is switched on in a mode
};
type EffectEnv = {
  mode: ModeDef;
  canvas: HTMLCanvasElement; // main stage canvas (usable as a texture source)
  ctx: CanvasRenderingContext2D; // main 2d context, in CSS pixels
  gl: WebGL2RenderingContext | null; // shared context; null for "2d" effects
};
type EffectInstance = {
  draw(frame: Frame): void; // over the mode's drawing; "gl" effects draw into the GL layer here
  under?(frame: Frame): void; // between the source image and the mode's drawing
  before?(frame: Frame, kind: TaskKind, index: number): void; // around one item of the mode
  after?(frame: Frame, kind: TaskKind, index: number): void;
  resize?(width: number, height: number): void; // drawing buffer, device pixels
  reset?(): void; // source changed, or the user pressed Clear
  enable?(on: boolean): void; // switched on or off; state survives while off
  dispose(): void;
};
```

Lifecycle: an instance is created the first time its switch is turned on in a mode, keeps its state while switched off, gets `reset()` when the source changes, and is disposed when the mode changes or the stage unmounts. An effect that throws is switched off and reported; the stage keeps running.

`"gl"` effects share one WebGL2 context on an off-DOM canvas owned by the stage (`src/stage/gl-layer.ts`). It is created the first time a gl effect is switched on, cleared to transparent before the gl effects draw each frame, and released with the stage. Leave GL state as you found it or set everything you need in `draw`. After a context loss and restore the effect is created again.

**`modes` decides where an effect is offered.** The tray and the command palette list exactly `effectsFor(mode.id)`, and the stage creates instances from the same list, so an effect that names its modes neither shows nor runs anywhere else. Trails names the four modes that give it something to follow (Objects, Body, Hands, Fusion); Constellation uses `"*"`. There is no per-effect rule in the shell.

**Intensity.** An effect that declares `intensity` gets a slider beside its switch while it is on (`src/components/EffectIntensity.tsx`). The value lives in `src/effects/lib/intensity.ts`: `effectIntensity(id, fallback)`, `setEffectIntensity(id, value)`, `onEffectIntensity(listener)`. Values are 0 to 1, kept in memory for the page session, and the effect reads its value each frame. The eight WebGL2 effects declare it; the two canvas effects do not.

**WebGL2 effects** are built on `src/gl/` (programs, render targets, bloom, a transform-feedback particle system, a line batch, reference-counted through `kit.ts`) and wrapped by `glEffect` in `src/effects/lib/gl-effect.ts`. On a software renderer the kit lowers particle counts and the scene target size. `window.__spectraGl` exposes live GL object counts for the leak test, only on a page opened with `?spectra-test` (`src/test-hooks.ts`); the Lab's shortened-benchmark hook is read under the same flag.

**No WebGL2.** When the probe finds none, the tray lists the `"gl"` effects with their switches disabled and a note saying why, the palette answers with a notice, and the host skips them without logging an error. If the probe passes but the stage's own context cannot be created, the effect is switched off and the user is told in a toast.

`under`, `before` and `after` are additions to the spec's `{ draw, resize, dispose }`. They exist because Constellation's scrim sits under the tracking and its halos, like object trails, sit between items; without them the v1 pixels cannot be reproduced.

Adding an effect, `src/effects/crosshair.ts`:

```ts
import type { EffectDef } from "./types";
const crosshair: EffectDef = {
  id: "crosshair",
  label: "Crosshair",
  modes: ["hands"],
  kind: "2d",
  order: 30,
  create: ({ ctx }) => ({
    draw(frame) {
      const tip = frame.result?.tasks.hand?.landmarks[0]?.[8];
      if (!tip) return;
      const q = frame.project(tip);
      ctx.strokeStyle = "#a4ffd9";
      ctx.strokeRect(q.x - 10, q.y - 10, 20, 20);
    },
    dispose() {},
  }),
};
export default crosshair;
```

## Panels

`src/panels/types.ts`, `src/studio-context.ts`

```ts
type PanelDef = {
  id: string;
  label: string; // tab text
  order: number;
  Component: ComponentType; // no props: use useStudio()
  visible?(studio: Studio): boolean; // hide the tab while it has nothing to show
};
type Studio = {
  mode: ModeDef;
  setMode(id: string): void;
  frame: FrameData;
  rows: InspectorRow[];
  count: number; // the mode's Tracked figure for this frame
  paused: boolean;
  setPaused(value: boolean): void; // pause or resume the stage and detection
  status: string; // "Ready", or what the stage is waiting for
  setConfidence(value: number): void;
  toggleEffect(id: string): void;
  select(id: number | null): void;
  motionDemo: boolean;
  toggleMotionDemo(): void;
  notice(text: string): void; // toast
  panel: string | null; // id of the panel on show, null for the first
  openPanel(id: string): void;
  immersive: boolean; // stage-only view
  stage: StageHooks; // draw on the stage, read pointer input: see "Measurement layer"
};
```

Five panels ship: Inspect (`src/panels/inspect.tsx`), which is the v1 rail content, Lab (`src/panels/lab.tsx` with its parts in `src/panels/lab/`), and Library, Ruler and Presence, each a `.tsx` file with its parts in a folder of the same name. The last two are measuring panels built on the measurement layer below. With one visible panel there is no tab bar. With more, `src/components/Inspector.tsx` shows a tab bar (`.panel-tabs`) and the chosen panel. Beside the stage the rail takes the stage's height and the panel scrolls inside it.

The Lab subscribes to the telemetry bus only while it is open, keeps fixed-size rings of samples (`lab-store.ts`), computes percentiles with `src/telemetry/stats.ts`, and runs the benchmark protocol in `benchmark.ts` (20 s measured after a 2 s warm-up per mode and delegate, exported as JSON or Markdown by `benchmark-report.ts`). It owns no timer while merely open: it is driven by the stage's `frame` events.

Adding a panel, `src/panels/about.tsx`:

```tsx
import { useStudio } from "../studio-context";
import type { PanelDef } from "./types";
function About() {
  const { mode, frame } = useStudio();
  return (
    <div>
      <h2>{mode.label}</h2>
      <p>
        {frame.result ? `${frame.result.latency.toFixed(0)} ms` : "Waiting"}
      </p>
    </div>
  );
}
const about: PanelDef = {
  id: "about",
  label: "About",
  order: 50,
  Component: About,
};
export default about;
```

## Measurement layer

Everything a panel needs to measure something real, added without changing default behaviour (pixels, session export and the Lite/CPU defaults are as before). A measuring panel is an ordinary panel (it has a tab, a component, and `visible()`), built from the pieces below.

### Pure helpers: `src/measure/`

No DOM, no clock, unit-tested (`tests/measure-*.test.ts`). They report "no data" as `NaN` or `null`, never as zero.

```ts
// one-euro.ts  time-aware One Euro filter; ONE_EURO_DEFAULTS is tuned for 0..1 image coordinates
new OneEuroFilter(options?).filter(value, timeMs): number; .reset()
new LandmarkSmoother(options?).smooth(points: Point[], timeMs): Point[]            // new points; input untouched
new LandmarkSetSmoother(options?).smooth(lists: Point[][], timeMs, keys?: string[]) // keys: handedness; a changed key restarts that list
// series.ts    fixed-capacity ring (reuses SampleWindow and percentile from telemetry/stats.ts)
describe(values): { count, mean, sd, min, max }                                     // sample sd (n - 1), skips non-finite
new Series(capacity).push(timeMs, value): boolean; .stats(spanMs?, now?); .percentile(q, spanMs?, now?); .samples(spanMs?, now?); .clear()
// noise.ts
type Measured = { value: number; error: number; unit: string; basis: string }       // basis says what the error covers
noiseFloor(stillValues): { count, sd, peakToPeak }                                  // from an interval held still
measured(value, error, unit, basis): Measured; isMeasured(m): boolean; combineErrors(...errors): number
// format.ts
formatMeasured(m): string                                                           // "12.3 ± 0.4 cm", "2.4 ± 1.2 m"; "not measured" without a usable error
roundError(error): { error, decimals }                                              // one significant figure, two when the error starts with 1 or 2
// angles.ts   degrees
jointAngle2D(a, b, c, aspect = 1), jointAngle3D(a, b, c), angleDifference(a, b)    // (-180, 180]
headPose(matrix): { yaw, pitch, roll } | null; headMatrix(yaw, pitch, roll): number[] // column-major 4x4; headMatrix is the inverse, for tests
// camera.ts   a pinhole camera recovered from one picture of a flat reference (fit in camera-fit.ts, 3x3 helpers in vec.ts)
fitCamera({ h, width, height, seen, plumbs?, near? }): Camera | null                // h: picture pixels to plane mm; seen: at least four { plane, image }
projectPoint(cam, x, y, z = 0): P2 | null                                           // plane mm and height to picture pixels; null at or beyond the horizon
heightAbove(cam, base, top): { z, off } | null                                      // height in mm of the plumb line through plane point `base` at picture point `top`
pixelRay(cam, p): { origin, dir }; toCamera(cam, x, y, z = 0): V3                   // world mm; camera frame is x right, y down, z forward
horizontalFov(cam): number; projectByPose(cam, x, y, z = 0)                         // degrees; projectByPose uses f, r, t only, for tests
```

**Rounding.** `formatMeasured` rounds the error first and writes the value to the same decimal place. The error keeps one significant figure, or two when its leading digit is 1 or 2: a bar of 1.2 cut to "1" would be off by a fifth, while 7.2 cut to "7" loses little. The leading digit is read before rounding, so 0.96 becomes 1 and 2.96 becomes 3.0. An error of exactly 0 is written "± 0" with the value to three figures; a missing or negative error, or a missing value, is "not measured".

**Camera.** A `Camera` holds the focal length `f` and principal point (`cx`, `cy`, the middle of the picture) in source pixels, the caller's own plane map inverted (`g`) with a `lift` vector added once per mm of height, the pose `r`, `t`, the camera's `centre` in world mm (`centre[2]` is its height), `handed` (+1 or -1: a 3D export must flip one axis when it is -1), the fit's `rms` in pixels and `focalResolved`. On the surface (`z = 0`) `projectPoint` is exactly the caller's plane map, so a camera never moves a measurement that lies on the plane. `focalResolved` is false when the fitted focal length sits at an end of its allowed range, or when the camera is within about 8 degrees of square-on to the surface and no plumb edge was given: positions on the surface are still good then, heights are not, and anything that shows a height must check it. The model assumes square pixels, the optical axis through the middle of the picture, and no lens distortion beyond what the caller removed first; whoever shows a number from it says so.

Rules for a measured number: it is a `Measured`, it carries an error that something produced (a noise floor from a still interval, a Monte Carlo spread), and its `basis` states what that error covers and what it leaves out. Show it with `formatMeasured`. A metric whose inputs were not seen is shown as "not seen".

### Ruler tools: `src/panels/ruler/`

The Ruler solves one plane map from the tapped reference (`derive(state)` gives `Derived`, whose `sheet.h` maps picture pixels to plane mm). A tool that needs more than spans, paths and areas lives in its own folder and plugs in through `extension-types.ts`. Box (`fit/`) and Walls (`walls/`) are built this way.

```ts
type ExtensionEnv = {
  s: RulerState;
  d: Derived;
  camera: Camera | null; // null until the reference is solved; check focalResolved before a height
  flat(tap: Pt): Pt; // a tap (source pixels) to the lens-corrected picture the plane map and camera work in
  unflat(flat: Pt): Pt;
};
type DrawEnv = ExtensionEnv & {
  frame: Frame;
  tapToCanvas(tap: Pt): { x: number; y: number }; // mirror and letterbox aware
  toCanvas(flat: Pt): { x: number; y: number };
};
type RulerExtension = {
  tool: ExtensionTool; // "box" | "wall", declared in state.ts
  label: string; // tool button text
  hint: string; // its tooltip
  step(env: ExtensionEnv): string; // the one-line instruction while the tool is chosen
  draw(ctx: CanvasRenderingContext2D, env: DrawEnv): void; // every still frame, whichever tool is chosen
  pointer(e: StagePointerEvent, env: ExtensionEnv): boolean; // true consumes the event
  undo(): void; // the Undo button while the tool is chosen
  Section: ComponentType<{ show: boolean }>; // under the Ruler's results; no numbers while `show` is false
  stub?: true; // a placeholder that is not offered
};
```

- `draw` runs after the Ruler's own drawing with context state saved and restored, and never on a moving picture. A tool that throws is logged once and skipped.
- `pointer` is called only while the tool is chosen and the picture is still. An unconsumed press may still grab one of the Ruler's own handles, so the reference stays adjustable.
- The Ruler works `step` out only when its own state changes. A tool whose instruction follows its own state shows it in its `Section` (Walls does, in a `role="status"` line).
- A tool keeps its own module-level store and clears what it placed through `onPointsCleared` (`state.ts`), which fires when the Ruler's points are cleared.

**Adding a tool.**

1. Add its id to `ExtensionTool` in `state.ts`.
2. Create `src/panels/ruler/<name>/index.tsx` whose default export is a `RulerExtension`.
3. Import it in `extensions.ts` and add it to the `EXTENSIONS` list. The tool button, the pointer routing, the drawing and the panel section follow from that one line.
4. Give every number a bar from `cameraTrials` (below) and word it with `reading.ts`.

**`cameraOf(s, d)` and `cameraTrials(s, d, n = 200)`** (`camera-of.ts`). `cameraOf` is the `Camera` for the current reference and plumb edges, or null until the reference is solved. `cameraTrials` is the same solve repeated `n` times with the reference corners and plumb edges moved by their tap uncertainty (1.5 screen pixels, one standard deviation, converted through the display scale): each `Trial` is `{ h, camera, seed }`, and `kept` is the share of retakes that gave a usable plane. A tool jitters its own taps inside each trial with that trial's `seed`, maps them through that trial's `h` and `camera`, and takes 2 standard deviations of its quantity over the trials as the bar, exactly as the Ruler's spans do. Both are seeded and memoized on the values they depend on, not on object identity, so they are cheap to call every frame and a span end dragged or a unit changed does not refit the camera. When further known sizes are fused in, the trials are retakes of the whole fused solve.

**Plumb edges** (`plumbs.ts`). An edge that is plumb in reality (a wall corner, a door frame) steadies the focal length and so every height. Any tool contributes some under its own name with `setPlumbs(owner, lines)`, where a line is two taps in source pixels; `allPlumbs()` returns every tool's, `plumbVersion()` goes up by one on each change (a memo key), and `subscribePlumbs(listener)` is for a component that must redraw when another tool's edge changes the camera. Walls publishes each floor corner and its ceiling point as one. They are dropped when the Ruler's points are cleared.

**A size too uncertain to state** (`reading.ts`). A length, height, area, volume or clearance whose bar is as large as the size itself says nothing as "value ± bar". `tooUncertain(m)` is true when `m.error >= |m.value|`, judged on the numbers as measured, not as rounded. `readingText(m)` then gives "too uncertain to state (bar ± ...)" followed by what narrows it, and `formatMeasured(m)` otherwise; `shortReading(text)` is the form for a stage label or a table cell. This is display text only: stored state, `data-` attributes, CSV and OBJ keep the numbers. It is the same line the Box verdict draws between "fits" and "too close to call". It is not part of the shared formatter, because elsewhere a true value of zero with a bar (an angle, a share) is a real reading.

**Fused known sizes** (`fuse-inputs.ts`, `fused.ts`, `fused-trials.ts`). With further references or known spans, `fuseSheet` replaces `sheet.h` with one least-squares plane map over every usable known size and sets `sheet.fused`; with none, the sheet is the first reference's own solve, unchanged. Each residual is a miss divided by its own standard deviation (a corner's reprojection over the tap uncertainty; a span's length error over the tap uncertainty of both ends combined with the tape uncertainty), so nothing has a hand-set weight. `fusedRuns` holds the seeded retakes of that solve, made once per set of known sizes and shared by spans, paths, areas and `cameraTrials`. `basisFor(lens, sheet.fused)` (`monte-carlo.ts`) is the one sentence saying what a bar covers; Box and Walls quote it inside their own.

### Result feed: every merged result, whichever panel is open

```ts
import { onVisionResult } from "../vision/result-feed";
const off = onVisionResult((result: VisionResult, generation: number) => {});
```

A panel is unmounted while another tab is on show, so reading `useStudio().frame` misses frames. `onVisionResult` is a module-level subscription on the telemetry bus (event `result`): subscribe from a module-level store and measuring continues in the background. The result is the raw model output, the same object the stage and the session export receive; never mutate it. Nothing arrives while the stage is paused or the tab is hidden. `result.generation` changes with the source and the mode changes `result.mode`: reset a session when either changes.

### Stage hooks: `useStudio().stage`, `setPaused`

`src/stage/stage-hooks.ts`. One module-level instance whose identity never changes.

```ts
type StageHooks = {
  addOverlay(
    draw: (ctx: CanvasRenderingContext2D, frame: Frame) => void,
  ): () => void;
  onPointer(handler: (e: StagePointerEvent) => boolean | void): () => void;
};
type StagePointerEvent = {
  type: "down" | "move" | "up"; // "up" with cancelled: true for a cancelled gesture
  point: Point; // image-normalized 0..1, mirror and letterbox aware (inverse of frame.project)
  inside: boolean; // over the image, not the letterbox bars
  source: { width: number; height: number }; // source size in pixels: point.x * source.width is a pixel
  canvas: { x: number; y: number }; // canvas CSS pixels, for hit radii and a loupe
  scale: number; // canvas CSS pixels per source pixel
  pointerId: number;
  pointerType: string;
  cancelled: boolean;
};
```

- **Overlay.** Drawn last, after the mode, the effects and the GL layer, on the one stage canvas in CSS pixels, so Record and Screenshot capture it. It is also drawn while paused (the stage keeps redrawing the held frame). Context state is saved and restored around it. An overlay that throws is logged once and skipped. Remove it in the effect cleanup.
- **Pointer.** Events from the stage canvas; the newest handler sees an event first and returns `true` to consume it (later handlers do not see it, the browser default is prevented, and on a consumed `down` the canvas captures the pointer so a drag continues outside it). While any handler is registered the canvas sets `touch-action: none` and a crosshair cursor (`canvas[data-pointer="on"]`). With none registered the canvas behaves as before. To drag a handle, remember the pointer id on `down` and return `true` for its `move` and `up`.
- **Pause.** `setPaused(true)` stops detection and holds the last frame (a video source pauses too); an uploaded photo is already still. Whoever pauses resumes.
- `unproject(point, rect, mirror)` in `src/vision/geometry.ts` is the pure inverse of `project`.

### World landmarks

The `pose` and `hand` tasks put MediaPipe's `worldLandmarks` in `extra.world` (type `WorldExtra`, `src/vision/types.ts`): `Point[][]`, one list per body or hand, indexed exactly like `landmarks`, in metres, `[]` when nothing was seen. The origin is the hip midpoint (pose) or the hand's centre (hand), so they give sizes, speeds and angles but not position in the room. MediaPipe tasks-vision 1.1.0 returns them for both kinds (checked in a real browser, `tests/e2e/measure.spec.ts`). Never depend on them: a panel must still work from image landmarks.

### Smooth landmarks (setting, on by default since 2.2)

`src/vision/settings.ts` (`useSmoothing()`, `smoothingOn()`), switch in the Inspect panel. The stage runs pose, hand and face landmarks through `ResultSmoother` (`smooth-result.ts`, One Euro) **for drawing only**: `frame.result` seen by modes and effects is smoothed, while `useStudio().frame`, the result feed, the session export and `extra.world` always hold the raw values. A measuring panel must measure the raw values or filter on its own terms. Remembered in `localStorage` (`spectra.smooth.v1`).

### Precision (setting, Fast by default)

A `TaskSpec` may declare `preciseModel`. With Precision on "Precise" (`usePrecision()`, `getPrecision()`, `modelOf(spec)`), the task runner loads it instead of `model` and restarts on a fresh worker when the setting changes; the delegate rules are unchanged. Body and Fusion declare `pose_landmarker_full.task` (9,398,198 bytes, Apache-2.0, in `scripts/models.json` with its SHA-256). `TaskResult.model` and the Lab (model cards, load times, benchmark) report the file actually in use. Models are still fetched on demand only, and the service worker caches the full model on its first real use with the other `models/` files (no list to edit). Remembered in `localStorage` (`spectra.precision.v1`). Defaults stay Lite on CPU because CI has no GPU.

### A measuring panel in ten lines (sketch: `store` is the panel's own module)

```tsx
function Sway() {
  const { stage } = useStudio(); // a panel never owns the stage
  const m = useSyncExternalStore(store.subscribe, store.sway); // a Measured, or undefined: "not seen"
  useEffect(() => {
    const offDraw = stage.addOverlay((ctx, f) => store.mark(ctx, f)); // captured by Screenshot
    const offTap = stage.onPointer(
      (e) => e.type === "down" && e.inside && store.tap(e.point, e.source),
    );
    const offFeed = onVisionResult((r) => store.add(r)); // module-level store: keeps measuring off-tab
    return () => (offDraw(), offTap(), offFeed());
  }, [stage]);
  return <p>{m ? formatMeasured(m) : "not seen"}</p>; // value ± error unit; show m.basis beside it
}
```

## Added in 2.2

- **`delegate: "AUTO"`** on a `TaskSpec`: resolved by `autoDelegate()` in `src/vision/delegate.ts` to GPU only when the WebGL2 probe names a renderer that is not software, and to CPU otherwise (no probe, hidden renderer name, SwiftShader, llvmpipe). The runner, telemetry and Lab only ever see CPU or GPU. The Lab's manual switch wins over AUTO, and the time-bounded GPU-to-CPU fallback still applies.
- **Live options**: `TaskSpec.live` holds options that may change while the task runs. A change posts `{ type: "options" }` to the running worker, with no reload. Body's People setting (1 to 4, `spectra.people.v1`) uses it.
- **Mode controls**: a `ModeDef` may export `controls`, a component the Inspect panel renders under the shared detection settings.
- **Finer names**: the Objects worker takes an option `finer` (`null`, or `{ model, floor, perPass, everyMs }`). When set it runs an `ImageClassifier` on the crop of each box, throttled, inside the same frame. A kept answer is `detection.finer = { label, score }` and `extra.finer = { state, floor, ms, classified }`. The detector's `label` and `score` are never changed. Off by default, in which case no classifier is fetched and results and exports are unchanged.
- **Object filter and Library**: `src/modes/lib/object-filter.ts` filters what Objects draws and lists; `src/panels/library/` lists every class the loaded models can name (`label-maps.json` is extracted from the model files and checked by `tests/library-labels.test.ts`) and counts sightings from the result feed.
- **Tracker**: `src/vision/tracker.ts` predicts each track from its velocity, matches globally, tolerates misses and can require hits before showing an id. `DEFAULT_TRACKER` keeps first-frame ids; the app uses `STEADY_TRACKER` (two hits) in `useSession.ts`.
- **Smoothing**: per-task One Euro parameters in `src/vision/smooth-result.ts`, now covering Gestures. It filters drawing only; the result feed, exports and the measuring panels read raw results.
- **Stability meter**: `src/panels/lab/stability*` measures landmark and box spread in source pixels over 3 s, raw beside smoothed, and identity switches over 60 s. It listens only while the Lab tab is mounted.
- **Ruler shapes**: `src/panels/ruler/` adds paths and areas (`shapes.ts`, `derive-shapes.ts`), a rectified top-down view (`topdown.ts`), an optional one-term radial lens fit (`lens.ts`) and SVG and CSV export (`export-plan.ts`). Every value is the direct geometric value; every error is 2 standard deviations of the seeded Monte Carlo over all tapped points.

## Added in 2.3

- **Depth mode**: `src/modes/depth.ts`, an eighth mode on a new task kind, `depth`, with its own worker (`public/depth-worker.js`) on ONNX Runtime Web and a `progress` message for long downloads. The pure parts are in `src/vision/depth/` (`colormap.ts`, `affine-fit.ts`, `unproject.ts`, `orbit.ts`) and the drawing, the 3D point view and the readout in `src/modes/lib/depth-*`. The 3D view is WebGL2 on an off-page canvas copied onto the stage; it owns no loop or timer and releases its GL objects when the view or the mode goes away. The session export gains an optional `depth` key (a summary of the map, never the map).
- **Metric depth from the Ruler**: `depth-metric.ts` reads the Ruler's state and never changes it. On a photo with a solved reference and a resolved focal length, the map cells inside the reference, further references and finished Area outlines are fitted as `1 / depth = a * output + b` (`fitDepth`), and the fit is refused with a reason when the marked floor's far edge is under 1.3 times as far as its near edge, when fewer than 30 points are usable, or when it leaves more than 25% scatter. A depth is a `Measured`: 2 standard deviations over the `cameraTrials` refits combined with twice the fit's scatter, and "not measured" when that bar exceeds half the depth (`depth-measured.ts`). The refits wait until the same scale has been asked for on 8 drawn frames, so dragging a Ruler handle does not trigger them per move.
- **Camera model**: `src/measure/camera.ts` with `camera-fit.ts` and `vec.ts`, described under "Pure helpers".
- **Ruler tool contract**: `extension-types.ts`, `extensions.ts`, `camera-of.ts`, `plumbs.ts`, described under "Ruler tools".
- **Box**: `src/panels/ruler/fit/`. A box of typed size stood on the plane, drawn in perspective from the camera (`project.ts`, `draw.ts`), with the clearance to each finished Area outline worked out again in every trial (`outline-trials.ts`) and a three-way verdict that is given only when the whole bar is on one side of zero (`verdict.ts`). `FIT_COVERAGE` in `verdict.ts` holds the measured coverage printed in the panel, and the tests fail if it drifts from what they observe.
- **Walls**: `src/panels/ruler/walls/`. Floor corners and ceiling points give a shell (`shell.ts`), every number is derived afresh per trial (`numbers.ts`, shown only when 80% of the trials could produce it), a mesh in metres with z up and handedness applied (`mesh.ts`) feeds the 3D preview and the OBJ, and `export-shell.ts` writes the CSV. Each corner and its ceiling point is published as a plumb edge.
- **More known sizes and the tape test**: `fuse-inputs.ts`, `fused.ts`, `fused-maths.ts`, `fused-trials.ts`, `derive-known.ts`, `store-known.ts`, `known-sizes.tsx`, `tape-entry.tsx`, `tape-test.tsx`. Further references and tape-measured spans go into one solve of the surface; a tape reading typed beside a span is only compared with it unless it is used as a known span. `SECOND_SHEET_COVERAGE` (`results.tsx`) and `COVERAGE_NOTE` (`monte-carlo.ts`) hold the measured coverage the panel prints, enforced by `tests/ruler-coverage.test.ts`.
- **Display of sizes**: `roundError` keeps two figures of an error that starts with 1 or 2, and `reading.ts` words a size whose bar is as large as itself. Stage labels are queued and placed together at the end of the frame (`overlay-labels.ts`).
- **Shell**: number keys reach eight modes (`MAX_MODE_KEYS` in `src/shell/shortcuts.ts`).

## Telemetry bus

`src/telemetry/bus.ts`. A typed emitter with no UI. Events carry measured values only.

```ts
telemetry.on("inference", (e) => {}); // { kind, latency, time, delegate }  one per task result
telemetry.on("model", (e) => {}); // { kind, requested, delegate, loadMs, note?, files? } one per model load
telemetry.on("frame", (e) => {}); // { time, dt, drawMs }  one per drawn stage frame
telemetry.on("result", (e) => {}); // { result, generation }  one per merged vision result; use onVisionResult
```

`model.note` says why the delegate in use is not the one requested. `model.files` lists what the worker fetched to load. `src/telemetry/task-status.ts` keeps one small record per model so that a load that happened while the Lab was closed is still on record.

`on` returns the unsubscribe function: call it when the consumer unmounts. `frame` events are built only while something is listening. A listener that throws is logged and does not affect inference or rendering.

## Shell

`src/shell/`, `src/components/`. The shell decides what is on screen; it never touches inference.

- **Layout.** `App.tsx` composes the header, the workspace (stage, rail, effects tray, result card) and the footer. In the one-column layout (760 px and narrower, `use-narrow.ts`) the rail is placed after the tray in the markup as well, so keyboard focus follows the visual order. The tips are a pill in the heading band beside the source actions; on a first visit the pill is highlighted and the card stays closed. Opened, the card takes its own row between the heading band and the workspace at every width, so it covers neither the stage nor the rail, and it is not shown while the stage reports an error. Closed, it takes no room, which keeps the metrics strip on a 1536 x 1024 screen.
- **Effects tray** (`StudioDeck`, `EffectsPicker`, `EffectIntensity`): one chip per effect of the current mode.
- **Shortcuts** (`shortcuts.ts`, `use-shortcuts.ts`): one `keydown` listener on `window`, ignored while typing, during IME composition, on key repeat and while the palette is open.
- **Command palette** (`commands.ts`, `palette-commands.ts`, `CommandPalette`): built from the registries only while it is open.
- **Immersive view** (`ImmersiveDock`, `immersive.css`): the stage fixed to the viewport, nothing scroll-locked.
- **Recorder and result card** (`use-clip-recorder.ts`, `ShareCard`): the one recorder implementation. A finished clip is downloaded and also shown in the card from an object URL that is revoked when the card is dismissed. Nothing is uploaded.
- **Source controls** (`use-source-controls.ts`): mode, source, pause, mirror and motion demo, with the rules that tie them together.

## Offline

`public/sw.js`, `src/shell/register-sw.ts`, `src/shell/use-studio-effects.ts`.

The service worker is registered in production builds only, after `load`, as `<base>sw.js?v=<content hash of the entry script>&r=<MediaPipe runtime version>` with scope `<base>`. The runtime version names the cache of runtime and model files, so upgrading `@mediapipe/tasks-vision` starts that cache afresh. Every path inside the worker is derived from its own location, so the same file works at `/` and at `/spectra-vision/`.

| Request                                                    | Strategy                                                       | Cache                                                   |
| ---------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------- |
| Navigation to the app                                      | Network first; the cached page if that fails or takes over 4 s | `spectra-shell-<v>`                                     |
| `assets/*` (hashed)                                        | Cache first                                                    | `spectra-shell-<v>`                                     |
| `models/*`, `runtime/*`                                    | Cache first, stored on first fetch                             | `spectra-assets-<runtime version>`, kept across deploys |
| Other same-scope files (worker script, icons, demo stills) | Network first, cached fallback                                 | `spectra-shell-<v>`                                     |
| Video, Range requests, non-GET, other origins              | Not handled                                                    | none                                                    |

- At install the worker stores the page and the hashed script and style its markup names, so it never takes over with a shell it cannot serve. Models and the runtime are never fetched ahead of use. On a first visit the page, its assets, the runtime and the first model are fetched before the worker controls the page, so the page tells the worker what it already fetched (an `adopt` message): its own resource entries, and on every model load the files the vision worker reports (its own script included) together with everything the page has loaded so far. A model is therefore kept after its first real use and never before, and a first-visit user can reload offline.
- Cached files are matched by address, ignoring `Vary`. A host that lists a request header under `Vary` (the preview server sends `Vary: Origin`, GitHub Pages `Vary: Accept-Encoding`) otherwise made the page's own script and style requests miss the stored copies.
- A new deploy changes the entry hash, so a new worker URL is registered. It activates at once, deletes the shell caches of other versions and claims the page. Navigations are network first, so a reload never shows the previous shell.
- Depth's runtime is under `runtime/ort-<version>/` and its model under `models/`, so the existing `models/*`, `runtime/*` rule keeps them after Depth's first use with no change to the worker. The folder carries the ONNX Runtime version so that an upgrade never pairs a cached wasm file with a newer script.
- The privacy copy in the app and the README says that the browser keeps the app and each used model on the device and how to remove them.

## Styles

`src/styles/index.css` imports `base.css`, `shell.css`, `stage.css` and `inspector.css`. `panel-tabs.css`, `deck.css`, `palette.css`, `coach.css`, `share.css` and `immersive.css` are imported by the component that uses them, and `src/panels/lab/lab.css` by the Lab. Plugins bring their own CSS file next to their module.

## File map

```
public/vision-worker.js     one task per worker; the kind switch
public/depth-worker.js      the Depth task on ONNX Runtime Web
public/sw.js                offline cache rules
src/registry.ts             collect(): shared discovery
src/modes/                  types.ts, index.ts, objects.ts, body.ts, hands.ts, face.ts, segment.ts,
                            gestures.ts, fusion.ts, depth.ts, lib/ (depth-* for Depth)
src/effects/                types.ts, index.ts, trails.ts, constellation.ts, plasma-hands.ts,
                            ember-trail.ts, neon-ribbons.ts, aura.ts, hologram.ts, starfield-pull.ts,
                            echo.ts, face-light.ts, lib/
src/panels/                 types.ts, index.ts, inspect.tsx, lab.tsx, lab/, library.tsx, library/,
                            ruler.tsx, ruler/, presence.tsx, presence/
src/panels/ruler/           the plane solve (homography.ts, derive.ts, monte-carlo.ts), shapes, plan and
                            lens; fused known sizes (fuse-inputs.ts, fused*.ts, known-sizes.tsx,
                            tape-test.tsx); the tool contract (extension-types.ts, extensions.ts,
                            camera-of.ts, plumbs.ts, reading.ts); fit/ (Box) and walls/ (Walls)
src/studio-context.ts       Studio type and useStudio()
src/session-export.ts       the JSON download
src/stage/                  renderer.ts, effect-host.ts, gl-layer.ts, use-stage-loop.ts, stage-hooks.ts
src/gl/                     WebGL2 kit for effects
src/vision/                 types.ts, frame.ts, draw.ts, geometry.ts, tracker.ts, merge.ts,
                            delegate.ts, webgl-probe.ts, task-runner.ts, useVision.ts, useSource.ts,
                            useSession.ts, settings.ts, smooth-result.ts, result-feed.ts
src/vision/depth/           colormap.ts, affine-fit.ts, unproject.ts, orbit.ts (pure)
src/measure/                one-euro.ts, series.ts, noise.ts, format.ts, angles.ts, camera.ts,
                            camera-fit.ts, vec.ts (pure)
src/telemetry/              bus.ts, stats.ts, task-status.ts
src/shell/                  shortcuts, palette, layout, recorder, service worker registration
src/components/             Header, ModeSwitch, CameraStage, StageMessage, CameraPicker, Inspector,
                            StudioDeck, EffectsPicker, EffectIntensity, ShareCard, CoachMarks,
                            CommandPalette, ImmersiveDock, HelpPanel, Footer
src/styles/                 index.css, base.css, shell.css, stage.css, inspector.css, panel-tabs.css,
                            deck.css, palette.css, coach.css, share.css, immersive.css
tests/                      unit: tracker, registry (with fixtures), vision, telemetry, modes, effects, lab,
                            shell, measure-*, stage-hooks, vision-smoothing, vision-settings, ruler-*,
                            fit-*, walls-*, depth-*;
                            e2e: studio, modes, effects, lab, shell, mode-switch, no-webgl, measure,
                            ruler*, fit, walls, depth
```
