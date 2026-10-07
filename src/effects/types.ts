import { isRecord } from "../registry";
import type { ModeDef } from "../modes";
import type { Frame } from "../vision/frame";
import type { TaskKind } from "../vision/types";

/** What the stage hands an effect when it is created. */
export type EffectEnv = {
  mode: ModeDef;
  /** The main stage canvas. A gl effect may upload it as a texture: at that
   * point it holds the source image, the mode's drawing and the 2d effects. */
  canvas: HTMLCanvasElement;
  /** The main 2d context, already scaled to CSS pixels. */
  ctx: CanvasRenderingContext2D;
  /** The stage's shared WebGL2 context. Null for "2d" effects. */
  gl: WebGL2RenderingContext | null;
};
/** Draws around one item of the mode's base drawing (see Frame.emit). */
export type EffectSlot = (frame: Frame, kind: TaskKind, index: number) => void;
export type EffectInstance = {
  /** Draw over the mode's base drawing. Called every drawn frame while on.
   * A "gl" effect draws into the shared WebGL layer here instead. */
  draw(frame: Frame): void;
  /** Optional: draw between the source image and the mode's base drawing. */
  under?(frame: Frame): void;
  /** Optional: draw just before / after the mode draws one tracked item. */
  before?: EffectSlot;
  after?: EffectSlot;
  /** Drawing-buffer size in device pixels, on create and when it changes. */
  resize?(width: number, height: number): void;
  /** Forget accumulated state: the source changed or the user pressed Clear. */
  reset?(): void;
  /** The user switched the effect on or off. State survives while off. */
  enable?(on: boolean): void;
  /** Release everything. For "gl" effects the context is still alive here. */
  dispose(): void;
};
export type EffectDef = {
  id: string;
  /** Text and accessible name of the effect's switch in the Effects picker. */
  label: string;
  /** Mode ids the effect supports, or "*" for every mode. */
  modes: string[] | "*";
  kind: "2d" | "gl";
  /** Position in the picker and draw order. Defaults to 100. */
  order?: number;
  defaultOn?: boolean;
  /** Called the first time the effect is switched on in a mode, not at startup. */
  create(env: EffectEnv): EffectInstance;
};

export function isEffect(value: unknown): value is EffectDef {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    (value.modes === "*" || Array.isArray(value.modes)) &&
    (value.kind === "2d" || value.kind === "gl") &&
    typeof value.create === "function"
  );
}
