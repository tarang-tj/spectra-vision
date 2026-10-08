/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** What this page can do with WebGL2: whether a context can be made at all,
 * and the name of the renderer behind it ("" when the browser hides it). */
export type WebglProbe = { webgl2: boolean; renderer: string };

let probe: WebglProbe | null | undefined;

/** Ask the browser once, with a throwaway 1 x 1 context that is released at
 * once, and keep the answer for the page's lifetime. Null when nothing can
 * be known: no document (unit tests, workers) or the probe itself failed.
 * A browser without WebGL2 is reported with one console warning, here. */
export function probeWebgl(): WebglProbe | null {
  if (probe !== undefined) return probe;
  probe = null;
  try {
    if (typeof document === "undefined") return probe;
    const gl = document.createElement("canvas").getContext("webgl2"),
      info = gl?.getExtension("WEBGL_debug_renderer_info"),
      renderer =
        gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    probe = { webgl2: !!gl, renderer };
    if (!gl)
      console.warn(
        "[spectra] WebGL2 is not available in this browser: GPU effects are off and models run on CPU.",
      );
  } catch {
    /* A failed probe says nothing either way. */
  }
  return probe;
}

/** True only when the browser was asked and gave no WebGL2 context. */
export const webgl2Missing = (): boolean => probeWebgl()?.webgl2 === false;
