/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { createTexture, deleteTexture } from "../../gl/resources";
import type { Frame } from "../../vision/frame";

/** The source image or video frame as a texture, for effects that re-light
 * the person's own pixels. The pixels stay on this device: they go from the
 * media element to the GPU and nowhere else. */
export type SourceTexture = {
  texture: WebGLTexture;
  /** Bring the texture up to date. Returns false when there is nothing
   * usable to show (no source yet, or the browser refused the upload). */
  update(frame: Frame): boolean;
  dispose(): void;
};

export function createSourceTexture(gl: WebGL2RenderingContext): SourceTexture {
  const texture = createTexture(gl);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
  let held: Element | null = null,
    usable = false,
    refused: Element | null = null;
  return {
    texture,
    update(frame) {
      const element = frame.source?.element;
      if (!element || element === refused) return false;
      const video = element instanceof HTMLVideoElement;
      if (video && element.readyState < 2) return usable && held === element;
      // A still image is uploaded once; a video frame while it is playing.
      if (held === element && usable && (!video || frame.paused)) return true;
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          element,
        );
        gl.bindTexture(gl.TEXTURE_2D, null);
        held = element;
        usable = true;
      } catch (error) {
        // A cross-origin source cannot be read; fall back for good.
        console.warn("[spectra effect] source pixels are unavailable:", error);
        refused = element;
        usable = false;
      }
      return usable;
    },
    dispose() {
      held = refused = null;
      usable = false;
      deleteTexture(gl, texture);
    },
  };
}
