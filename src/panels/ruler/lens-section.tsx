/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Derived } from "./derive";
import { setLensOn, setTool, type RulerState } from "./store";

const px = (v: number) => `${v < 10 ? v.toFixed(2) : v.toFixed(1)} px`;

/** Optional lens correction: tap three or more points along each of two or
 * more edges that are straight in reality (a door frame, a wall line). It is
 * off unless the user turns it on, and it applies only if it measurably
 * straightens those edges. */
export default function LensSection({ s, d }: { s: RulerState; d: Derived }) {
  const fit = d.lensFit,
    edges = s.shapes.filter((x) => x.kind === "edge" && x.done).length;
  let verdict: string;
  if (!fit)
    verdict = `Tap along ${Math.max(0, 2 - edges)} more straight edge${edges >= 1 ? "" : "s"} to fit a correction.`;
  else if (!fit.improved)
    verdict = `Not used: the best fit leaves the edges ${px(fit.after)} from straight, against ${px(fit.before)} without it, which is not a clear improvement.`;
  else if (s.lensOn)
    verdict = `Applied to every point. Edges are ${px(fit.before)} from straight in the photo and ${px(fit.after)} after correction.`;
  else
    verdict = `Would help: edges are ${px(fit.before)} from straight in the photo and ${px(fit.after)} after correction. Turn it on to use it.`;
  return (
    <section className="ruler-block" aria-label="Lens correction">
      <h3>Lens correction (optional)</h3>
      <p className="ruler-note">
        A wide phone lens bends straight lines near the edges of the picture.
        Tap three or more points along each of two or more edges you know are
        straight, such as a door frame or a wall line, and SPECTRA fits one
        correction and shows how much straighter it makes them.
      </p>
      <div className="ruler-group" role="group" aria-label="Lens edges">
        <button
          className="button"
          aria-pressed={s.tool === "edge"}
          onClick={() => setTool(s.tool === "edge" ? "span" : "edge")}
        >
          Tap straight edges
        </button>
        <button
          className="button"
          aria-pressed={s.lensOn}
          disabled={!fit?.improved}
          onClick={() => setLensOn(!s.lensOn)}
        >
          Use lens correction
        </button>
      </div>
      <p className="ruler-basis" data-testid="ruler-lens" role="status">
        {edges} straight edge{edges === 1 ? "" : "s"} tapped. {verdict}
      </p>
    </section>
  );
}
