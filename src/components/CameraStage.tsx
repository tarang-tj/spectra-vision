import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Expand,
  FlipHorizontal,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Eraser,
  Circle,
  Square,
} from "lucide-react";
import type { GameDef, GameState } from "../games";
import type { ModeDef } from "../modes";
import { useStageLoop } from "../stage/use-stage-loop";
import type { FrameData } from "../vision/frame";
import { useRecording } from "../vision/useRecording";
export default function CameraStage(props: {
  mode: ModeDef;
  /** Source, latest result, tracks, mirror and settings for the renderer. */
  data: FrameData;
  paused: boolean;
  onPause: () => void;
  onMirror: () => void;
  status: string;
  error: string;
  onRetry: () => void;
  retryLabel: string;
  onDemo: () => void;
  notice: (text: string) => void;
  game: GameDef | null;
  onGameState: (state: GameState | null) => void;
}) {
  const { mode, paused, status, error, onRetry, onDemo, notice } = props,
    { source, mirror } = props.data;
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  const [fullscreen, setFullscreen] = useState(false);
  const capture = useRecording(
    canvas,
    `${mode.id}:${source?.generation ?? 0}`,
    notice,
  );
  latest.current = props;
  // All canvas drawing (mode, effects, games) happens in the stage loop.
  const loop = useStageLoop(canvas, stage, latest, notice);
  useEffect(() => {
    const handler = () =>
      setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const shot = () =>
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `spectra-${mode.id}-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice("Screenshot saved.");
    });
  const expand = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.current?.requestFullscreen)
        await stage.current.requestFullscreen();
      else notice("Fullscreen is unavailable in this browser.");
    } catch {
      notice("Fullscreen is unavailable in this browser.");
    }
  };
  const badge =
    source?.kind === "camera"
      ? "CAMERA"
      : source?.kind === "demo"
        ? source.element instanceof HTMLVideoElement
          ? "ANIMATED DEMO"
          : "DEMO IMAGE"
        : source?.kind === "video"
          ? "LOCAL VIDEO"
          : "LOCAL IMAGE";
  return (
    <div
      className={`camera-stage ${fullscreen ? "is-fullscreen" : ""}`}
      ref={stage}
    >
      <canvas ref={canvas} aria-label={`${mode.label} canvas`} role="img" />
      <div className="stage-top">
        <span className="hud-badge">
          <i className={source?.kind === "camera" ? "live-dot" : ""} />
          {source ? badge : "NO SOURCE"}
        </span>
        <span className="hud-badge mode-badge">{mode.label}</span>
      </div>
      {capture.recording && (
        <div className="recording-badge" role="status">
          <i />
          REC {String(capture.seconds).padStart(2, "0")} / 30s
        </div>
      )}
      {error ? (
        <div className="stage-message error" role="alert">
          <strong>Let’s get you seeing.</strong>
          <p>{error}</p>
          <div>
            <button className="button primary compact" onClick={onRetry}>
              {props.retryLabel}
            </button>
            <button className="button compact" onClick={onDemo}>
              Try demo
            </button>
          </div>
        </div>
      ) : status !== "Ready" ? (
        <div className="loading">
          <LoaderCircle className="spin" size={24} />
          <span>{status}…</span>
        </div>
      ) : !source ? (
        <div className="stage-message">
          <strong>Choose your view.</strong>
          <p>Start your camera, upload a file, or try the demo.</p>
          <button className="button primary compact" onClick={onDemo}>
            Try demo
          </button>
        </div>
      ) : null}
      <div className="stage-bottom">
        <div className="playback">
          <button
            className="icon-button"
            aria-label={paused ? "Resume detection" : "Pause detection"}
            onClick={props.onPause}
            disabled={!source}
          >
            {paused ? <Play size={21} /> : <Pause size={21} />}
          </button>
          <span title={source?.label}>
            {source?.label ?? "Choose a source"}
            {paused && <small>Paused</small>}
          </span>
        </div>
        <div className="stage-tools">
          <button className="tool" onClick={onDemo} aria-label="Use demo image">
            <RotateCcw size={20} />
            <span>Demo</span>
          </button>
          {mode.clearable && (
            <button
              className="tool"
              onClick={() => {
                loop.clear();
                notice("Light trails cleared.");
              }}
              aria-label="Clear light trails"
            >
              <Eraser size={20} />
              <span>Clear</span>
            </button>
          )}
          <button
            className="tool"
            aria-pressed={mirror}
            onClick={props.onMirror}
          >
            <FlipHorizontal size={20} />
            <span>Mirror</span>
          </button>
          <button className="tool" onClick={shot} disabled={!source}>
            <Camera size={20} />
            <span>Screenshot</span>
          </button>
          <button
            className="tool record-tool"
            aria-label={capture.recording ? "Stop recording" : "Record canvas"}
            aria-pressed={capture.recording}
            onClick={capture.toggle}
            disabled={!source || capture.saving || status !== "Ready"}
          >
            {capture.recording ? <Square size={20} /> : <Circle size={20} />}
            <span>{capture.recording ? "Stop" : "Record"}</span>
          </button>
          <button className="tool" onClick={expand}>
            <Expand size={20} />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
