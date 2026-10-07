import { ChevronRight, Lightbulb } from "lucide-react";
import type { Mode, Track, VisionResult } from "../vision/types";
import { COLORS } from "../vision/types";
import { isPinching } from "../vision/geometry";
export default function Inspector({
  mode,
  tracks,
  result,
  confidence,
  onConfidence,
  trails,
  onTrails,
  selected,
  onSelect,
  mirror,
  aspect,
  constellation,
  onConstellation,
  motionDemo,
  onMotionDemo,
}: {
  mode: Mode;
  tracks: Track[];
  result: VisionResult | null;
  confidence: number;
  onConfidence: (v: number) => void;
  trails: boolean;
  onTrails: () => void;
  selected: number | null;
  onSelect: (id: number | null) => void;
  mirror: boolean;
  aspect: number;
  constellation: boolean;
  onConstellation: () => void;
  motionDemo: boolean;
  onMotionDemo: () => void;
}) {
  const rows =
    mode === "objects"
      ? tracks.map((t) => ({
          key: t.id,
          label: t.label,
          detail: `${Math.round(t.score * 100)}%`,
          point: { x: t.box.x + t.box.w / 2, y: t.box.y + t.box.h / 2 },
          color: COLORS[(t.id - 1) % COLORS.length],
        }))
      : (result?.landmarks ?? []).map((points, i) => ({
          key: i + 1,
          label:
            mode === "body"
              ? "Body"
              : `${result?.handedness[i] ?? "Hand"} hand`,
          detail:
            mode === "body"
              ? `${points.length} landmarks`
              : isPinching(points, false, aspect)
                ? "Pinching"
                : "Open",
          point: points[mode === "body" ? 23 : 0],
          color: COLORS[i % COLORS.length],
        }));
  return (
    <aside className="inspector">
      <div className="frame-list">
        <h2>
          In the frame <span className="count">{rows.length || "—"}</span>
        </h2>
        <div className="detections" aria-live="polite">
          {rows.length ? (
            rows.map((r) => (
              <button
                className={`detection-row ${selected === r.key ? "selected" : ""}`}
                key={r.key}
                onClick={() => onSelect(selected === r.key ? null : r.key)}
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
          {mode === "objects" &&
            trails &&
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
          onChange={(e) => onConfidence(Number(e.target.value))}
          style={
            {
              "--value": `${((confidence - 0.1) / 0.85) * 100}%`,
            } as React.CSSProperties
          }
        />
        <div className="switch-row">
          <span>Trails</span>
          <button
            className="switch"
            role="switch"
            aria-checked={trails}
            aria-label="Trails"
            onClick={onTrails}
          >
            <span />
          </button>
        </div>
        <div className="switch-row">
          <span>Constellation</span>
          <button
            className="switch"
            role="switch"
            aria-label="Constellation"
            aria-checked={constellation}
            onClick={onConstellation}
          >
            <span />
          </button>
        </div>
        <button
          className="motion-demo button compact"
          aria-pressed={motionDemo}
          onClick={onMotionDemo}
        >
          {motionDemo ? "Use still demo" : "Try motion demo"}
        </button>
      </div>
      <p className="mode-tip">
        <Lightbulb size={22} />
        {mode === "hands"
          ? "Pinch thumb + index to paint. Release to stop."
          : mode === "body"
            ? "Step back. Keep your whole body in the frame."
            : "Switch to Hands. Pinch to paint."}
      </p>
    </aside>
  );
}
