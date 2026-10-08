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
};

/** Draws one stage frame in a fixed order: source image, effects that sit under
 * the tracking, the mode's own drawing, 2d effects, then the GPU layer.
 * It owns the only Frame, the effect instances and the GL layer. */
export class StageRenderer {
  private layer = new GlLayer();
  private effects: EffectHost;
  private frame: Frame;
  private mode: ModeDef | null = null;
  private generation: number | undefined;
  private lastTime = 0;
  private modeFailed = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    report: (message: string) => void,
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
    // Mode and source changes are picked up here, on the frame after
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
    if (measure)
      telemetry.emit("frame", {
        time,
        dt,
        drawMs: performance.now() - started,
      });
  }

  dispose() {
    this.effects.dispose();
    this.layer.dispose();
    this.mode = null;
  }
}
