import type { GameDef, GameInstance, GameState } from "../games";
import type { ModeDef } from "../modes";
import { telemetry } from "../telemetry/bus";
import { createFrame, updateFrame } from "../vision/frame";
import type { Frame, FrameData } from "../vision/frame";
import { EffectHost } from "./effect-host";
import { GlLayer } from "./gl-layer";

/** What the stage component hands the renderer each frame. */
export type StageInputs = {
  mode: ModeDef;
  data: FrameData;
  paused: boolean;
  game: GameDef | null;
  onGameState: (state: GameState | null) => void;
};

/** Draws one stage frame in a fixed order: source image, effects that sit under
 * the tracking, the mode's own drawing, 2d effects, the GPU layer, then the game.
 * It owns the only Frame, the effect instances, the GL layer and the game. */
export class StageRenderer {
  private layer = new GlLayer();
  private effects: EffectHost;
  private frame: Frame;
  private mode: ModeDef | null = null;
  private generation: number | undefined;
  private gameDef: GameDef | null = null;
  private game: GameInstance | null = null;
  private score = NaN;
  private status = "";
  private lastTime = 0;
  private modeFailed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private report: (message: string) => void,
  ) {
    this.effects = new EffectHost(canvas, ctx, this.layer, report);
    this.frame = createFrame((slot, kind, index) =>
      this.effects.emit(slot, kind, index, this.frame),
    );
  }

  /** Forget accumulated effect state (the Clear tool). */
  clear() {
    this.effects.reset();
  }

  render(
    time: number,
    width: number,
    height: number,
    dpr: number,
    reducedMotion: boolean,
    inputs: StageInputs,
  ) {
    const { ctx, frame } = this,
      { data, paused } = inputs,
      source = data.source,
      measure = telemetry.listening("frame"),
      started = measure ? performance.now() : 0;
    // Mode, source and game changes are picked up here, on the frame after
    // they happen, so the loop below is the only place that touches them.
    if (inputs.mode !== this.mode) {
      this.mode = inputs.mode;
      this.modeFailed = false;
      this.effects.setMode(inputs.mode);
    }
    if (source?.generation !== this.generation) {
      this.generation = source?.generation;
      this.effects.reset();
    }
    if (inputs.game !== this.gameDef) this.setGame(inputs.game, inputs);
    this.effects.sync(data.settings.effects);
    this.effects.resize(this.canvas.width, this.canvas.height);

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#10191c";
    ctx.fillRect(0, 0, width, height);
    if (!source) return;
    const e = source.element,
      sw = e instanceof HTMLVideoElement ? e.videoWidth : e.naturalWidth,
      sh = e instanceof HTMLVideoElement ? e.videoHeight : e.naturalHeight;
    if (!sw || !sh) return;
    const dt = paused || !this.lastTime ? 0 : time - this.lastTime;
    this.lastTime = time;
    updateFrame(
      frame,
      data,
      sw,
      sh,
      width,
      height,
      dpr,
      time,
      dt,
      paused,
      !paused && !reducedMotion,
    );
    const rect = frame.rect;
    ctx.save();
    if (frame.mirror) {
      ctx.translate(width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(e, rect.x, rect.y, rect.w, rect.h);
    ctx.restore();
    this.effects.under(frame);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    try {
      inputs.mode.drawBase(ctx, frame);
    } catch (error) {
      // A mode that fails on one odd result must not freeze the stage. It is
      // logged once per mode, not thirty times a second.
      if (!this.modeFailed)
        console.error(`[spectra mode] ${inputs.mode.id} draw failed:`, error);
      this.modeFailed = true;
    }
    this.effects.draw(frame, "2d");
    if (this.effects.draw(frame, "gl") && this.layer.canvas)
      ctx.drawImage(this.layer.canvas, 0, 0, width, height);
    if (this.game) this.play(this.game, inputs);
    if (measure)
      telemetry.emit("frame", {
        time,
        dt,
        drawMs: performance.now() - started,
      });
  }

  private play(game: GameInstance, inputs: StageInputs) {
    try {
      // A paused stage freezes the game: it is drawn but not advanced.
      if (!inputs.paused) game.update(this.frame);
      game.draw(this.ctx, this.frame);
      const state = game.state();
      if (state.score !== this.score || state.status !== this.status) {
        this.score = state.score;
        this.status = state.status;
        inputs.onGameState({ score: state.score, status: state.status });
      }
    } catch (error) {
      console.error("[spectra game] stopped:", error);
      this.report("The game stopped: it hit an error.");
      this.endGame();
      inputs.onGameState(null);
    }
  }

  private setGame(def: GameDef | null, inputs: StageInputs) {
    this.endGame();
    this.gameDef = def;
    if (!def) return;
    try {
      this.game = def.create({
        mode: inputs.mode,
        canvas: this.canvas,
        ctx: this.ctx,
      });
    } catch (error) {
      console.error(`[spectra game] ${def.id} could not start:`, error);
      this.report(`${def.label} could not start.`);
    }
  }

  private endGame() {
    try {
      this.game?.dispose();
    } catch (error) {
      console.error("[spectra game] dispose failed:", error);
    }
    this.game = null;
    this.score = NaN;
    this.status = "";
  }

  dispose() {
    this.endGame();
    this.gameDef = null;
    this.effects.dispose();
    this.layer.dispose();
    this.mode = null;
  }
}
