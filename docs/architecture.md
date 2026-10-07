# SPECTRA architecture (v2 plugin skeleton)

SPECTRA is built from four registries. Each one is a folder that is scanned at build time with `import.meta.glob`, so **adding one file adds one entry**. Nothing else needs editing: no list, no switch, no shared stylesheet.

| Registry | Folder         | A plugin file exports | Shows up as                         |
| -------- | -------------- | --------------------- | ----------------------------------- |
| Modes    | `src/modes/`   | `ModeDef`             | A button on the mode switch         |
| Effects  | `src/effects/` | `EffectDef`           | A switch in the Effects picker      |
| Games    | `src/games/`   | `GameDef`             | A row in the Play panel             |
| Panels   | `src/panels/`  | `PanelDef`            | A tab in the inspector (right rail) |

Visual and interaction design is specified in [design/implementation-spec.md](design/implementation-spec.md). This file covers structure only.

## Rules every plugin must obey

These are binding. A plugin that breaks one does not merge.

1. **Real inference only.** Nothing may render a detection, landmark, score or metric that a model or a clock did not produce. Demo inputs stay labelled as demos.
2. **Privacy copy stays true.** Nothing leaves the browser: no uploads, no analytics, no remote calls with user media or results.
3. **Models load on demand** for the selected mode, never at startup.
4. **One in-flight bitmap per worker.** Stale generations are discarded. Tracks and object URLs are released when the source changes.
5. **No always-on work when paused or when the tab is hidden.** Effects and games stop with the stage: do not start your own `requestAnimationFrame`, timer or worker loop. Draw only when the stage calls you.
6. **Accessible names on every control, visible focus, reduced motion respected** (`frame.animate` is false when it applies).
7. **Prettier formatting is part of the gate.**

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
- In `src/modes`, `src/effects` and `src/games`, **every `.ts` file except `index.ts` and `types.ts` is a plugin**. In `src/panels`, every `.tsx` file is a plugin. Put shared helpers in a subfolder (for example `src/effects/lib/`) or in `src/vision/`.
- **Import from `./types`, never from `./index`, inside a plugin file.** `index.ts` imports the plugin files, so a value imported back from it does not exist yet when the plugin loads, and the app fails to start. Importing another registry's index (a game reading `getMode` from `../modes`) is fine.
- A plugin may import its own stylesheet (`import "./my-panel.css"`). The shared files under `src/styles/` are not edited by plugins.

## Frame state

`src/vision/frame.ts`. One object is handed to everything that draws.

```ts
type FrameData = {
  result: VisionResult | null; // latest merged model output
  tracks: Track[]; // object tracks with ids and trails
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
6. `game.update(frame)` (skipped while paused), then `game.draw(ctx, frame)`.

Everything ends up on the one main 2D canvas, so Record and Screenshot capture effects and games with no further work. Nothing is drawn when there is no source.

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
  inspector(frame: FrameData): InspectorRow[]; // row count is also the "Tracked" metric
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
| from      | `{ type: "ready", delegate }`                             | The task is loaded                          |
| to worker | `{ type: "frame", bitmap, time, generation, confidence }` | Run on one transferred bitmap               |
| from      | `{ type: "result", result: TaskResult }`                  | Output for that frame; the bitmap is closed |
| from      | `{ type: "error", error }`                                | Load or inference failed                    |

- **Only `object`, `pose` and `hand` are implemented.** `face`, `segment` and `gesture` throw "not implemented" from the single `handlerFor(kind)` switch in the worker. That switch is the one place to add a kind: return `create`, `run`, `confidence` and `read`.
- **Fusion.** A mode with several tasks gets one worker per task, each fed its own bitmap. `mergeResults` (`src/vision/merge.ts`) keeps the latest result of every task under `result.tasks`, drops results from an older source generation, takes the flat fields and `time` from the primary (first) task, and reports `latency` as the slowest task. The app counts a frame (FPS, tracker, session history) only when the primary task's time advances.
- **Delegates.** A task asks for `"CPU"` or `"GPU"`. If a GPU task fails before producing a single result, the runner terminates that worker and starts a new one on CPU (`fallbackDelegate` in `src/vision/delegate.ts`). The delegate in use is on every `TaskResult` and on the `model` telemetry event. The three v1 modes request CPU.
- Session export keeps the v1 frame shape (flat fields only). A fusion mode that wants its extra tasks exported has to extend the history entry in `src/App.tsx`.

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

## Games

`src/games/types.ts`

```ts
type GameDef = {
  id: string;
  label: string;
  requires: string; // mode id
  order?: number;
  create(env: {
    mode: ModeDef;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  }): GameInstance;
};
type GameInstance = {
  update(frame: Frame): void; // not called while paused
  draw(ctx: CanvasRenderingContext2D, frame: Frame): void; // every drawn frame
  state(): { score: number; status: string }; // shown in the Play panel
  dispose(): void;
};
```

The Play panel lists every game. Starting one switches to the mode it requires; leaving that mode stops it. The stage calls the game after the effects, reads `state()` each frame and tells the panel only when the score or status changed. The Play tab is hidden while no game is registered.

Adding a game, `src/games/reach.ts`:

```ts
import type { GameDef } from "./types";
const reach: GameDef = {
  id: "reach",
  label: "Reach",
  requires: "body",
  create() {
    let score = 0;
    return {
      update(frame) {
        const wrist = frame.result?.tasks.pose?.landmarks[0]?.[15];
        if (wrist && wrist.y < 0.2) score++;
      },
      draw(ctx, frame) {
        ctx.fillText(String(score), frame.rect.x + 16, frame.rect.y + 32);
      },
      state: () => ({ score, status: "Playing" }),
      dispose() {},
    };
  },
};
export default reach;
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
  paused: boolean;
  status: string;
  setConfidence(value: number): void;
  toggleEffect(id: string): void;
  select(id: number | null): void;
  motionDemo: boolean;
  toggleMotionDemo(): void;
  game: string | null;
  gameState: { score: number; status: string } | null;
  setGame(id: string | null): void;
  notice(text: string): void; // toast
};
```

The existing inspector content is the first panel, Inspect (`src/panels/inspect.tsx`). With one visible panel there is no tab bar and the rail is the v1 rail. With more, `src/components/Inspector.tsx` shows a tab bar (`.panel-tabs`) and the chosen panel.

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
telemetry.on("model", (e) => {}); // { kind, requested, delegate, loadMs } one per model load
telemetry.on("frame", (e) => {}); // { time, dt, drawMs }  one per drawn stage frame
```

`on` returns the unsubscribe function: call it when the consumer unmounts. `frame` events are built only while something is listening. A listener that throws is logged and does not affect inference or rendering.

## Styles

`src/styles/index.css` imports `base.css`, `shell.css`, `stage.css` and `inspector.css`: the v1 rules, moved without change. `panel-tabs.css` styles the inspector tab bar and is imported by `Inspector.tsx`. Plugins bring their own CSS file next to their module.

## File map

```
public/vision-worker.js     one task per worker; the kind switch
src/registry.ts             collect(): shared discovery
src/modes/                  types.ts, index.ts, objects.ts, body.ts, hands.ts
src/effects/                types.ts, index.ts, trails.ts, constellation.ts
src/games/                  types.ts, index.ts
src/panels/                 types.ts, index.ts, inspect.tsx, play.tsx, play.css
src/studio-context.ts       Studio type and useStudio()
src/stage/                  renderer.ts, effect-host.ts, gl-layer.ts, use-stage-loop.ts
src/vision/                 types.ts, frame.ts, draw.ts, geometry.ts, tracker.ts, merge.ts,
                            delegate.ts, task-runner.ts, useVision.ts, useSource.ts, useRecording.ts
src/telemetry/bus.ts        typed event bus
src/components/             Header, CameraStage, CameraPicker, Inspector, EffectsPicker, Footer
src/styles/                 index.css, base.css, shell.css, stage.css, inspector.css, panel-tabs.css
tests/                      tracker, registry (with fixtures), vision (merge, fallback, runner), telemetry, e2e
```
