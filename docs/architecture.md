# SPECTRA architecture (v2)

SPECTRA is built from three registries. Each one is a folder that is scanned at build time with `import.meta.glob`, so **adding one file adds one entry**. Nothing else needs editing: no list, no switch, no shared stylesheet.

| Registry | Folder         | A plugin file exports | Shows up as                         | Shipped                                                                                                          |
| -------- | -------------- | --------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Modes    | `src/modes/`   | `ModeDef`             | A button on the mode switch         | Objects, Body, Hands, Face, Segment, Gestures, Fusion                                                            |
| Effects  | `src/effects/` | `EffectDef`           | A switch in the effects tray        | Trails, Constellation, Plasma hands, Ember trail, Neon ribbons, Aura, Hologram, Starfield pull, Echo, Face light |
| Panels   | `src/panels/`  | `PanelDef`            | A tab in the inspector (right rail) | Inspect, Lab                                                                                                     |

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
type TaskKind = "object" | "pose" | "hand" | "face" | "segment" | "gesture";
type TaskSpec = {
  kind: TaskKind;
  model: string;
  options: Record<string, unknown>;
  delegate: "CPU" | "GPU";
};
type TaskResult = {
  kind: TaskKind;
  generation: number;
  time: number;
  latency: number;
  delegate: "CPU" | "GPU"; // the delegate that actually ran
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

`model` is a file name under `public/models/`. `options` are passed to the MediaPipe task unchanged.

One worker runs one task. Messages:

| Direction | Message                                                   | Meaning                                     |
| --------- | --------------------------------------------------------- | ------------------------------------------- |
| to worker | `{ type: "init", base, task: TaskSpec }`                  | Load the runtime and the model              |
| from      | `{ type: "downloaded" }`                                  | The model and wasm bytes have arrived       |
| from      | `{ type: "ready", delegate }`                             | The task is loaded                          |
| to worker | `{ type: "frame", bitmap, time, generation, confidence }` | Run on one transferred bitmap               |
| from      | `{ type: "result", result: TaskResult }`                  | Output for that frame; the bitmap is closed |
| from      | `{ type: "error", error }`                                | Load or inference failed                    |

- **All six kinds are implemented** in the single `handlerFor(kind)` switch in the worker. That switch is the one place to add a kind: return `create`, `run`, `confidence` and `read`. `face` puts blendshapes and matrices in `extra`, `gesture` the top gesture of each hand, `segment` two 256 x 256 byte masks and per-class measurements (typed as `FaceExtra`, `GestureExtra`, `SegmentExtra`; read them with the helpers in `src/modes/lib/task-extras.ts`).
- The `ready` message also lists the files the worker fetched from the site (runtime, wasm, model). The page passes them to the service worker; see "Offline".
- **Fusion.** A mode with several tasks gets one worker per task, each fed its own bitmap. `mergeResults` (`src/vision/merge.ts`) keeps the latest result of every task under `result.tasks`, drops results from an older source generation, takes the flat fields and `time` from the primary (first) task, and reports `latency` as the slowest task. The app counts a frame (FPS, tracker, session history) only when the primary task's time advances.
- **Status.** `useVision` reads its status from the runners: it is "Ready" only while every task of the mode is loaded. A runner that starts again (a delegate switch, a GPU to CPU fallback) reports it through `RunnerEvents.onRestart`, and the stage shows "Loading model" until it is ready again.

### Delegates

`src/vision/delegate.ts`, `src/vision/task-runner.ts`, `src/vision/webgl-probe.ts`.

A task asks for `"CPU"` or `"GPU"` in its `TaskSpec`. The three v1 modes, Face, Gestures and Fusion ask for CPU. Segment asks for GPU, where its model is several times faster.

- **Choice store.** The Lab's CPU or GPU switch calls `chooseDelegate(kind, delegate)`. The choice is kept per task kind for the page's lifetime, `requestedDelegate(spec)` returns the choice or else the mode's own delegate, and every runner of that kind restarts on it (`onDelegateChoice`). `chooseDelegate(kind, null)` gives the decision back to the mode.
- **Software-renderer refusal.** Before a GPU task starts, `gpuUnavailable()` asks the page's one WebGL probe for the renderer name. With no WebGL2, or with a software renderer (SwiftShader, llvmpipe), GPU is refused up front and the task runs on CPU with the reason recorded. A software renderer can run the GPU path, but an abandoned start there was measured to keep the browser's GPU process busy for 16 seconds to minutes. The worker refuses a software renderer for `segment` on its own as well.
- **Fallback on error.** A GPU task that posts an error before producing a single result is restarted once on CPU (`fallbackDelegate`). A CPU failure, or a GPU task that worked and then broke, is a real error.
- **Time bounds.** A GPU task that hangs posts no error, so the start is bounded: `GPU_READY_LIMIT_MS` (8 s, from the worker's "downloaded" message to "ready"; the worker fetches the model and the wasm itself and says when the bytes are in, so a slow connection is not counted against the GPU) and `GPU_FIRST_RESULT_LIMIT_MS` (5 s from the first frame sent to the first result). Past either, `gpuStartTimeout` gives the reason and the runner restarts on CPU. The check runs on a 250 ms timer only while a GPU task is loading or owes its first result. The decision is bounded; how fast CPU then recovers on a renderer slow enough to trigger it is not.
- The delegate in use is on every `TaskResult` and on the `model` telemetry event, with a `note` saying why it differs from the one requested.

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
};
```

Two panels ship: Inspect (`src/panels/inspect.tsx`), which is the v1 rail content, and Lab (`src/panels/lab.tsx` with its parts in `src/panels/lab/`). With one visible panel there is no tab bar. With more, `src/components/Inspector.tsx` shows a tab bar (`.panel-tabs`) and the chosen panel. Beside the stage the rail takes the stage's height and the panel scrolls inside it.

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

## Telemetry bus

`src/telemetry/bus.ts`. A typed emitter with no UI. Events carry measured values only.

```ts
telemetry.on("inference", (e) => {}); // { kind, latency, time, delegate }  one per task result
telemetry.on("model", (e) => {}); // { kind, requested, delegate, loadMs, note?, files? } one per model load
telemetry.on("frame", (e) => {}); // { time, dt, drawMs }  one per drawn stage frame
```

`model.note` says why the delegate in use is not the one requested. `model.files` lists what the worker fetched to load. `src/telemetry/task-status.ts` keeps one small record per model so that a load that happened while the Lab was closed is still on record.

`on` returns the unsubscribe function: call it when the consumer unmounts. `frame` events are built only while something is listening. A listener that throws is logged and does not affect inference or rendering.

## Shell

`src/shell/`, `src/components/`. The shell decides what is on screen; it never touches inference.

- **Layout.** `App.tsx` composes the header, the workspace (stage, rail, effects tray, result card) and the footer. In the one-column layout (760 px and narrower, `use-narrow.ts`) the rail is placed after the tray in the markup as well, so keyboard focus follows the visual order. The first-run tips sit under the stage at every width, so they cover nothing on it.
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
- The privacy copy in the app and the README says that the browser keeps the app and each used model on the device and how to remove them.

## Styles

`src/styles/index.css` imports `base.css`, `shell.css`, `stage.css` and `inspector.css`. `panel-tabs.css`, `deck.css`, `palette.css`, `coach.css`, `share.css` and `immersive.css` are imported by the component that uses them, and `src/panels/lab/lab.css` by the Lab. Plugins bring their own CSS file next to their module.

## File map

```
public/vision-worker.js     one task per worker; the kind switch
public/sw.js                offline cache rules
src/registry.ts             collect(): shared discovery
src/modes/                  types.ts, index.ts, objects.ts, body.ts, hands.ts, face.ts, segment.ts,
                            gestures.ts, fusion.ts, lib/
src/effects/                types.ts, index.ts, trails.ts, constellation.ts, plasma-hands.ts,
                            ember-trail.ts, neon-ribbons.ts, aura.ts, hologram.ts, starfield-pull.ts,
                            echo.ts, face-light.ts, lib/
src/panels/                 types.ts, index.ts, inspect.tsx, lab.tsx, lab/
src/studio-context.ts       Studio type and useStudio()
src/session-export.ts       the JSON download
src/stage/                  renderer.ts, effect-host.ts, gl-layer.ts, use-stage-loop.ts
src/gl/                     WebGL2 kit for effects
src/vision/                 types.ts, frame.ts, draw.ts, geometry.ts, tracker.ts, merge.ts,
                            delegate.ts, webgl-probe.ts, task-runner.ts, useVision.ts, useSource.ts,
                            useSession.ts
src/telemetry/              bus.ts, stats.ts, task-status.ts
src/shell/                  shortcuts, palette, layout, recorder, service worker registration
src/components/             Header, ModeSwitch, CameraStage, StageMessage, CameraPicker, Inspector,
                            StudioDeck, EffectsPicker, EffectIntensity, ShareCard, CoachMarks,
                            CommandPalette, ImmersiveDock, HelpPanel, Footer
src/styles/                 index.css, base.css, shell.css, stage.css, inspector.css, panel-tabs.css,
                            deck.css, palette.css, coach.css, share.css, immersive.css
tests/                      unit: tracker, registry (with fixtures), vision, telemetry, modes, effects, lab,
                            shell; e2e: studio, modes, effects, lab, shell, mode-switch, no-webgl
```
