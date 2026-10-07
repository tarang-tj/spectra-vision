import { isRecord } from "../registry";
import type { ModeDef } from "../modes";
import type { Frame } from "../vision/frame";

export type GameEnv = {
  mode: ModeDef;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};
/** Shown in the Play panel. `status` is short free text such as "Playing". */
export type GameState = { score: number; status: string };
export type GameInstance = {
  /** Advance the game from this frame's real landmarks. Not called while paused. */
  update(frame: Frame): void;
  /** Draw on top of the effects. Called every drawn frame, paused or not. */
  draw(ctx: CanvasRenderingContext2D, frame: Frame): void;
  state(): GameState;
  dispose(): void;
};
export type GameDef = {
  id: string;
  label: string;
  /** Id of the mode whose tracking the game is played with. */
  requires: string;
  /** Position in the Play panel. Defaults to 100. */
  order?: number;
  /** Called when the player starts the game, never at startup. */
  create(env: GameEnv): GameInstance;
};

export function isGame(value: unknown): value is GameDef {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.requires === "string" &&
    typeof value.create === "function"
  );
}
