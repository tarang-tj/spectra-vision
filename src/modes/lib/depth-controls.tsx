/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import { plumbVersion, subscribePlumbs } from "../../panels/ruler/plumbs";
import { useRuler } from "../../panels/ruler/state";
import { useStudio } from "../../studio-context";
import { measuredDepth } from "./depth-measured";
import { depthScale } from "./depth-metric";
import { depthExtra, depthText, metricSummary } from "./depth-readout";
import { FAR_CUTOFF } from "./depth-points";
import {
  getDepthView,
  onDepthView,
  resetTurn,
  setDepthView,
  TURN_STEP,
  turnView,
} from "./depth-store";
import "./depth-controls.css";

const TURNS: { label: string; key: string; yaw: number; pitch: number }[] = [
  { label: "Turn left", key: "ArrowLeft", yaw: TURN_STEP, pitch: 0 },
  { label: "Turn right", key: "ArrowRight", yaw: -TURN_STEP, pitch: 0 },
  { label: "Tilt up", key: "ArrowUp", yaw: 0, pitch: -TURN_STEP },
  { label: "Tilt down", key: "ArrowDown", yaw: 0, pitch: TURN_STEP },
];

/** The Depth mode's controls: which view, the map's opacity, turning the 3D
 * view from the keyboard, and what the depths mean (relative, or metres with
 * what the fit rests on). */
export default function DepthControls() {
  const view = useSyncExternalStore(onDepthView, getDepthView),
    { frame } = useStudio();
  // The scale follows the Ruler: redraw this text when its points change.
  useRuler();
  useSyncExternalStore(subscribePlumbs, plumbVersion);
  const task = frame.result?.tasks.depth,
    extra = depthExtra(task),
    scale =
      task && extra ? depthScale(extra, task.generation, frame.source) : null,
    cloud = view.view === "cloud",
    nearest = scale?.metric && extra ? measuredDepth(scale, extra.max) : null;
  return (
    <div className="measure-settings depth-controls">
      <div role="group" aria-label="Depth view">
        <button
          className="button compact"
          aria-pressed={!cloud}
          onClick={() => setDepthView({ view: "map" })}
        >
          Depth map
        </button>
        <button
          className="button compact"
          aria-pressed={cloud}
          onClick={() => setDepthView({ view: "cloud" })}
        >
          3D view
        </button>
      </div>
      {cloud ? (
        <>
          <div
            role="group"
            aria-label="Turn the 3D view"
            onKeyDown={(event) => {
              const turn = TURNS.find((t) => t.key === event.key);
              if (!turn) return;
              event.preventDefault();
              turnView(turn.yaw, turn.pitch);
            }}
          >
            {TURNS.map((turn) => (
              <button
                key={turn.label}
                className="button compact"
                onClick={() => turnView(turn.yaw, turn.pitch)}
              >
                {turn.label}
              </button>
            ))}
          </div>
          <button className="button compact" onClick={resetTurn}>
            Reset view
          </button>
          <p data-testid="depth-turn">
            Turned {view.yaw.toFixed(0)}° sideways and {view.pitch.toFixed(0)}°
            up or down. Drag the picture to turn it, or use these buttons or the
            arrow keys while one of them has focus.
          </p>
          <p>
            {scale?.metric
              ? `Each point sits at its fitted depth along its camera ray, coloured from the photo. Points the fit puts more than ${FAR_CUTOFF} times as far as the marked floor's far edge are left out.`
              : "A relief: the picture is kept flat and each point is raised by the model's relative depth. It shows order and shape, not real geometry."}
          </p>
        </>
      ) : (
        <>
          <label className="range-label" htmlFor="depth-opacity">
            Depth map opacity <output>{Math.round(view.opacity * 100)}%</output>
          </label>
          <input
            id="depth-opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={view.opacity}
            onChange={(e) => setDepthView({ opacity: Number(e.target.value) })}
            style={
              { "--value": `${view.opacity * 100}%` } as React.CSSProperties
            }
          />
        </>
      )}
      <p data-testid="depth-legend">
        Bright yellow is near, dark purple is far.{" "}
        {scale?.metric && extra
          ? `Nearest point: ${depthText(scale, extra.max)}. Farthest point: ${depthText(scale, extra.min)}.`
          : "The values are relative: they order the scene but are not lengths."}
      </p>
      {scale && (
        <div data-testid="depth-scale" data-metric={scale.metric}>
          {scale.metric ? (
            <>
              {metricSummary(scale).map((line) => (
                <p key={line}>{line}</p>
              ))}
              {nearest && nearest !== "pending" && <p>{nearest.basis}</p>}
            </>
          ) : (
            <p>{scale.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
