import { ChevronRight, Lightbulb } from "lucide-react";
import { useStudio } from "../studio-context";
import { COLORS } from "../vision/types";
import type { PanelDef } from "./types";

/** What is in the frame, the motion map, and the model controls. The effect
 * switches live in the tray under the stage (components/StudioDeck). */
function Inspect() {
  const studio = useStudio(),
    { rows, mode, count } = studio,
    { result, tracks, mirror, settings } = studio.frame,
    { confidence, selected } = settings;
  return (
    <>
      <div className="frame-list">
        <h2>
          In the frame <span className="count">{count || "—"}</span>
        </h2>
        <div className="detections" aria-live="polite">
          {rows.length ? (
            rows.map((r) => (
              <button
                className={`detection-row ${selected === r.key ? "selected" : ""}`}
                key={r.key}
                onClick={() => studio.select(selected === r.key ? null : r.key)}
                aria-pressed={selected === r.key}
              >
                <i style={{ background: r.color }} />
                <span>{r.label}</span>
                <small>{r.detail}</small>
                <ChevronRight size={15} />
              </button>
            ))
          ) : (
            <p className="empty">
              {result
                ? "Nothing detected yet. Try brighter light or move closer."
                : "Waiting for the first frame."}
            </p>
          )}
        </div>
      </div>
      <div className="motion">
        <svg
          viewBox="0 0 240 132"
          role="img"
          aria-label="Motion map: normalized positions in the image"
        >
          <defs>
            <pattern
              id="grid"
              width="40"
              height="33"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M40 0H0V33"
                fill="none"
                stroke="#29443e"
                strokeWidth=".6"
              />
            </pattern>
          </defs>
          <rect width="240" height="132" fill="url(#grid)" />
          {/* Tracks exist only in a mode that follows objects; their paths follow the Trails effect. */}
          {settings.effects.trails &&
            tracks.map((t) => (
              <polyline
                key={t.id}
                points={t.trail
                  .map((p) => `${(mirror ? 1 - p.x : p.x) * 240},${p.y * 132}`)
                  .join(" ")}
                fill="none"
                stroke={COLORS[(t.id - 1) % COLORS.length]}
                strokeWidth="1"
                opacity=".55"
              />
            ))}
          {rows.map((r) => (
            <circle
              key={r.key}
              cx={(mirror ? 1 - r.point.x : r.point.x) * 240}
              cy={r.point.y * 132}
              r="4"
              fill={r.color}
            />
          ))}
        </svg>
        <p>Motion map</p>
      </div>
      <div className="controls">
        <label className="range-label" htmlFor="confidence">
          Confidence <output>{Math.round(confidence * 100)}%</output>
        </label>
        <input
          id="confidence"
          type="range"
          min=".1"
          max=".95"
          step=".05"
          value={confidence}
          onChange={(e) => studio.setConfidence(Number(e.target.value))}
          style={
            {
              "--value": `${((confidence - 0.1) / 0.85) * 100}%`,
            } as React.CSSProperties
          }
        />
        {/* Only where the mode has a clip: otherwise the button would change
            its own label and nothing on the stage. */}
        {mode.demo.motion && (
          <button
            className="motion-demo button compact"
            aria-pressed={studio.motionDemo}
            onClick={studio.toggleMotionDemo}
          >
            {studio.motionDemo ? "Use still demo" : "Try motion demo"}
          </button>
        )}
      </div>
      <p className="mode-tip">
        <Lightbulb size={22} />
        {mode.hint}
      </p>
    </>
  );
}

const inspect: PanelDef = {
  id: "inspect",
  label: "Inspect",
  order: 10,
  Component: Inspect,
};
export default inspect;
