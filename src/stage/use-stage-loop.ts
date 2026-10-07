import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { StageRenderer } from "./renderer";
import type { StageInputs } from "./renderer";

// The stage redraws at most about 30 times a second, as in v1.
const MIN_DRAW_GAP = 32;

/** Drives the stage canvas from requestAnimationFrame. The browser stops the
 * callbacks while the tab is hidden, so nothing runs then; while paused the
 * last frame is still redrawn (mirror, selection and resize must stay live)
 * but time stands still for effects and games. */
export function useStageLoop(
  canvas: RefObject<HTMLCanvasElement | null>,
  stage: RefObject<HTMLDivElement | null>,
  latest: RefObject<StageInputs>,
  notice: (message: string) => void,
) {
  const renderer = useRef<StageRenderer | null>(null),
    report = useRef(notice);
  report.current = notice;
  useEffect(() => {
    let raf = 0,
      stopped = false,
      lastDraw = 0;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const render = (time: number) => {
      if (stopped) return;
      if (time - lastDraw < MIN_DRAW_GAP) {
        raf = requestAnimationFrame(render);
        return;
      }
      lastDraw = time;
      const c = canvas.current,
        el = stage.current;
      if (c && el) {
        const rect = el.getBoundingClientRect(),
          dpr = Math.min(2, devicePixelRatio),
          width = Math.round(rect.width * dpr),
          height = Math.round(rect.height * dpr);
        if (c.width !== width || c.height !== height) {
          c.width = width;
          c.height = height;
        }
        const context = c.getContext("2d");
        if (context) {
          context.setTransform(dpr, 0, 0, dpr, 0, 0);
          renderer.current ??= new StageRenderer(c, context, (message) =>
            report.current(message),
          );
          renderer.current.render(
            time,
            rect.width,
            rect.height,
            dpr,
            reducedMotion.matches,
            latest.current,
          );
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      // Releases effect state, the game and the WebGL context, if one was made.
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, [canvas, stage, latest]);
  return {
    /** Clear accumulated effect state such as painted trails. */
    clear: () => renderer.current?.clear(),
  };
}
