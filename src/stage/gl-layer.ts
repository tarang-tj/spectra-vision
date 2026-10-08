/** The stage's one WebGL2 surface. It is an off-DOM canvas that "gl" effects
 * draw into; the renderer then copies it onto the main 2d canvas, so Record
 * and Screenshot capture shader effects with no extra work.
 *
 * It is created the first time a gl effect is switched on, so a session that
 * never uses one never holds a WebGL context, and it is released on dispose. */
export class GlLayer {
  canvas: HTMLCanvasElement | null = null;
  gl: WebGL2RenderingContext | null = null;
  /** True between a context loss and its restore; nothing may draw then. */
  lost = false;
  /** Bumped on every restore: GL objects made before it are gone. */
  epoch = 0;
  private unavailable = false;
  private onLost = (event: Event) => {
    // Allow the browser to restore the context later.
    event.preventDefault();
    this.lost = true;
  };
  private onRestored = () => {
    this.lost = false;
    this.epoch++;
  };

  /** The shared context, or null when this browser cannot provide WebGL2. */
  acquire(): WebGL2RenderingContext | null {
    if (this.gl || this.unavailable) return this.gl;
    try {
      const canvas = document.createElement("canvas"),
        gl = canvas.getContext("webgl2", {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          preserveDrawingBuffer: false,
        });
      if (!gl) throw new Error("WebGL2 is not available.");
      canvas.addEventListener("webglcontextlost", this.onLost);
      canvas.addEventListener("webglcontextrestored", this.onRestored);
      this.canvas = canvas;
      this.gl = gl;
    } catch (error) {
      this.unavailable = true;
      console.warn("[spectra stage] GPU effects are unavailable:", error);
    }
    return this.gl;
  }

  /** Size the layer to the stage and clear it to transparent for this frame.
   * Returns true when the size changed. */
  begin(width: number, height: number): boolean {
    const { canvas, gl } = this;
    if (!canvas || !gl) return false;
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return resized;
  }

  dispose() {
    const { canvas, gl } = this;
    if (canvas) {
      canvas.removeEventListener("webglcontextlost", this.onLost);
      canvas.removeEventListener("webglcontextrestored", this.onRestored);
      // Shrink the buffer and drop the context now instead of waiting for GC.
      canvas.width = 1;
      canvas.height = 1;
    }
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      /* The context is already gone. */
    }
    this.canvas = null;
    this.gl = null;
    this.lost = false;
  }
}
