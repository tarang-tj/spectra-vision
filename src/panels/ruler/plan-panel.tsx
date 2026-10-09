/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useStudio } from "../../studio-context";
import type { Derived } from "./derive";
import { download, planCsv, planSvg } from "./export-plan";
import { view } from "./overlay";
import { drawPrims } from "./plan-draw";
import { LEGEND, layoutScene, type Prim } from "./plan-layout";
import { buildScene, type PlanScene } from "./plan-scene";
import { rasterOf } from "./snapshot";
import type { RulerState } from "./store";
import { fitBox, renderTopDown, type Fit } from "./topdown";

type Drawn = {
  scene: PlanScene;
  fit: Fit;
  prims: Prim[];
  floor: HTMLCanvasElement;
};

/** The surface seen from above, drawn to scale, and "Save plan". The picture
 * is rectified once per change (one animation frame after it), never per
 * stage frame. */
export default function PlanPanel({
  s,
  d,
  show,
}: {
  s: RulerState;
  d: Derived;
  show: boolean;
}) {
  const { notice } = useStudio(),
    canvas = useRef<HTMLCanvasElement>(null),
    drawn = useRef<Drawn | null>(null),
    [photo, setPhoto] = useState(false),
    scene = useMemo(() => (show ? buildScene(s, d) : null), [s, d, show]);

  useEffect(() => {
    const el = canvas.current;
    if (!scene || !el || !d.sheet) {
      drawn.current = null;
      return;
    }
    const sheet = d.sheet;
    let id = 0,
      waited = 0;
    // The picture's copy is retaken by the stage after the panel reopens, a
    // frame or two later; wait for it (up to about half a second) rather than
    // drawing the lines on a blank floor.
    const attempt = () => {
      if (!view.snap && waited++ < 30) {
        id = requestAnimationFrame(attempt);
        return;
      }
      {
        const fit = fitBox(scene.bounds),
          floor = drawn.current?.floor ?? document.createElement("canvas");
        floor.width = el.width = fit.width;
        floor.height = el.height = fit.height;
        const fctx = floor.getContext("2d"),
          ctx = el.getContext("2d");
        if (!fctx || !ctx) return;
        fctx.clearRect(0, 0, fit.width, fit.height);
        const snap = view.snap,
          src = snap ? rasterOf(snap) : null,
          top =
            src && snap
              ? renderTopDown(src, snap.scale, sheet.h, d.lens, fit)
              : null;
        if (top) fctx.putImageData(new ImageData(top.data, top.w, top.h), 0, 0);
        ctx.fillStyle = "#0b1214";
        ctx.fillRect(0, 0, fit.width, fit.height);
        ctx.drawImage(floor, 0, 0);
        const prims = layoutScene(scene, fit);
        drawPrims(ctx, prims);
        drawn.current = { scene, fit, prims, floor };
      }
    };
    id = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(id);
  }, [scene, d.sheet, d.lens]);

  if (!scene) return null;

  function save() {
    const out = drawn.current;
    if (!out) {
      notice("The plan is still drawing. Try again in a moment.");
      return;
    }
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-"),
        svg = planSvg(
          out.scene,
          out.fit,
          out.prims,
          photo ? out.floor.toDataURL("image/png") : null,
        );
      download(`spectra-plan-${stamp}.svg`, svg, "image/svg+xml");
      setTimeout(
        () => download(`spectra-plan-${stamp}.csv`, planCsv(s, d), "text/csv"),
        150,
      );
      notice("Plan saved to your downloads.");
    } catch {
      notice("The plan could not be saved by this browser.");
    }
  }

  return (
    <section className="ruler-block ruler-plan" aria-label="Top-down view">
      <h3>Top-down view</h3>
      <canvas
        ref={canvas}
        role="img"
        data-testid="ruler-plan"
        aria-label="Top-down view of the surface, drawn to scale with the reference, your shapes and a scale bar"
      />
      <p className="ruler-basis">
        The frozen picture seen from above through the reference, drawn to
        scale. {LEGEND}
      </p>
      <button
        className="button"
        aria-pressed={photo}
        onClick={() => setPhoto(!photo)}
      >
        Include photo in the saved plan
      </button>
      <button className="button" onClick={save}>
        Save plan
      </button>
      <p className="ruler-basis">
        Save plan downloads an SVG drawing and a CSV of every measurement with
        its error and its vertices in millimetres on the surface. Both stay on
        this device.
      </p>
    </section>
  );
}
