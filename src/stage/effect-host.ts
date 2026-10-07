import { effectsFor } from "../effects";
import type { EffectDef, EffectInstance } from "../effects";
import type { ModeDef } from "../modes";
import type { Frame, FrameSlot } from "../vision/frame";
import type { TaskKind } from "../vision/types";
import type { GlLayer } from "./gl-layer";

type Entry = {
  def: EffectDef;
  instance: EffectInstance | null;
  on: boolean;
  /** Set when the effect threw or could not start; it is skipped from then on. */
  failed: boolean;
  /** The GL epoch the instance was created in (gl effects only). */
  epoch: number;
};

/** Owns the effect instances of the current mode. An effect is created the
 * first time it is switched on, keeps its state while off, and is disposed
 * when the mode changes or the stage goes away. One broken effect is switched
 * off and reported; it never takes the stage down with it. */
export class EffectHost {
  private entries: Entry[] = [];
  private mode: ModeDef | null = null;
  private wanted: Readonly<Record<string, boolean>> | null = null;
  private width = 0;
  private height = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
    private layer: GlLayer,
    private report: (message: string) => void,
  ) {}

  setMode(mode: ModeDef) {
    this.dispose();
    this.mode = mode;
    this.entries = effectsFor(mode.id).map((def) => ({
      def,
      instance: null,
      on: false,
      failed: false,
      epoch: 0,
    }));
  }

  /** Apply the user's switches. Cheap when nothing changed: the settings
   * object is replaced only when a switch is flipped. */
  sync(wanted: Readonly<Record<string, boolean>>) {
    if (wanted === this.wanted) return;
    this.wanted = wanted;
    for (const entry of this.entries) {
      const on = !!wanted[entry.def.id];
      if (on === entry.on) continue;
      entry.on = on;
      if (on && !entry.instance && !entry.failed) this.create(entry);
      this.guard(entry, () => entry.instance?.enable?.(on));
    }
  }

  private create(entry: Entry) {
    if (!this.mode) return;
    try {
      const gl = entry.def.kind === "gl" ? this.layer.acquire() : null;
      if (entry.def.kind === "gl" && !gl)
        throw new Error("WebGL2 is not available.");
      entry.instance = entry.def.create({
        mode: this.mode,
        canvas: this.canvas,
        ctx: this.ctx,
        gl,
      });
      entry.epoch = this.layer.epoch;
      entry.instance.resize?.(this.width, this.height);
    } catch (error) {
      this.fail(entry, error);
    }
  }

  private fail(entry: Entry, error: unknown) {
    entry.failed = true;
    console.error(`[spectra effect] ${entry.def.id} stopped:`, error);
    this.report(`${entry.def.label} stopped: this effect hit an error.`);
  }

  private guard(entry: Entry, run: () => void) {
    if (entry.failed) return;
    try {
      run();
    } catch (error) {
      this.fail(entry, error);
    }
  }

  /** Drawing-buffer size in device pixels; effects hear about changes only. */
  resize(width: number, height: number) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    for (const entry of this.entries)
      this.guard(entry, () => entry.instance?.resize?.(width, height));
  }

  /** The source changed or the user pressed Clear. */
  reset() {
    for (const entry of this.entries)
      this.guard(entry, () => entry.instance?.reset?.());
  }

  // The three methods below run every frame: indexed loops, no closures.
  under(frame: Frame) {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!entry.on || entry.failed || !entry.instance?.under) continue;
      try {
        entry.instance.under(frame);
      } catch (error) {
        this.fail(entry, error);
      }
    }
  }

  /** Frame.emit lands here: effects interleave with the mode's own drawing. */
  emit = (slot: FrameSlot, kind: TaskKind, index: number, frame: Frame) => {
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      const run = entry.on && !entry.failed ? entry.instance?.[slot] : null;
      if (!run) continue;
      try {
        run(frame, kind, index);
      } catch (error) {
        this.fail(entry, error);
      }
    }
  };

  /** Draw the active effects of one kind. Returns true if any gl effect drew,
   * in which case the caller composites the layer. */
  draw(frame: Frame, kind: EffectDef["kind"]): boolean {
    let drew = false;
    for (let i = 0; i < this.entries.length; i++) {
      const entry = this.entries[i];
      if (!entry.on || entry.failed || entry.def.kind !== kind) continue;
      if (kind === "gl") {
        if (this.layer.lost) continue;
        // After a context restore every GL object is gone: build the effect again.
        if (entry.instance && entry.epoch !== this.layer.epoch) {
          entry.instance = null;
          this.create(entry);
        }
        if (!drew) this.layer.begin(this.width, this.height);
      }
      if (!entry.instance || entry.failed) continue;
      try {
        entry.instance.draw(frame);
        drew = true;
      } catch (error) {
        this.fail(entry, error);
      }
    }
    return drew;
  }

  dispose() {
    for (const entry of this.entries) {
      try {
        entry.instance?.dispose();
      } catch (error) {
        console.error(
          `[spectra effect] ${entry.def.id} dispose failed:`,
          error,
        );
      }
      entry.instance = null;
    }
    this.entries = [];
    this.wanted = null;
  }
}
