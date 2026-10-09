import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent, ReactNode, RefObject } from "react";
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
import type { ModeDef } from "../modes";
import { stageHooks } from "../stage/stage-hooks";
import { useStageLoop } from "../stage/use-stage-loop";
import type { FrameData } from "../vision/frame";
import { useClipRecorder } from "../shell/use-clip-recorder";
import type { Clip } from "../shell/use-clip-recorder";
import StageMessage from "./StageMessage";

/** What the keyboard shortcuts and the command palette may ask of the stage. */
export type StageActions = { record(): void; screenshot(): void };

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
  /** Filled by the stage so the shell can trigger Record and Screenshot. */
  actions: RefObject<StageActions | null>;
  /** A finished recording, for the share card. */
  onClip: (clip: Clip) => void;
  /** Shell overlays that belong on the stage (the first-run tips). */
  children?: ReactNode;
}) {
  const { mode, paused, status, error, onRetry, onDemo, notice } = props,
    { source, mirror } = props.data;
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  const [fullscreen, setFullscreen] = useState(false);
  // True while a panel listens for pointer input: the canvas then keeps touch
  // gestures to itself (see .camera-stage canvas[data-pointer] in stage.css).
  const measuring = useSyncExternalStore(
    stageHooks.subscribe,
    stageHooks.hasPointerHandlers,
  );
  const capture = useClipRecorder(
    canvas,
    `${mode.id}:${source?.generation ?? 0}`,
    notice,
    props.onClip,
  );
  latest.current = props;
  // All canvas drawing (mode and effects) happens in the stage loop.
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
  const canRecord = !!source && !capture.saving && status === "Ready";
  // Same rules as the buttons: a shortcut never does what a disabled tool cannot.
  props.actions.current = {
    record: () => {
      if (canRecord) capture.toggle();
    },
    screenshot: () => {
      if (source) shot();
    },
  };
  // Pointer input for panels (stage-hooks.ts). With no handler registered this
  // does nothing, so the canvas behaves as it always did.
  const pointer =
    (type: "down" | "move" | "up", cancelled = false) =>
    (e: PointerEvent<HTMLCanvasElement>) => {
      if (!stageHooks.hasPointerHandlers()) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const consumed = stageHooks.dispatch(
        type,
        (e.clientX - box.left) / box.width,
        (e.clientY - box.top) / box.height,
        { id: e.pointerId, type: e.pointerType, cancelled },
      );
      if (!consumed) return;
      e.preventDefault();
      // A drag that leaves the canvas keeps reporting until the finger lifts.
      if (type === "down") e.currentTarget.setPointerCapture(e.pointerId);
    };
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
      <canvas
        ref={canvas}
        aria-label={`${mode.label} canvas`}
        role="img"
        data-pointer={measuring ? "on" : undefined}
        onPointerDown={pointer("down")}
        onPointerMove={pointer("move")}
        onPointerUp={pointer("up")}
        onPointerCancel={pointer("up", true)}
      />
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
        <StageMessage
          error={error}
          retryLabel={props.retryLabel}
          onRetry={onRetry}
          onDemo={onDemo}
        />
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
      ) : (
        props.children
      )}
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
          {/* Below 1100 px the tool captions are hidden, so each tool carries
              its name itself. */}
          <button
            className="tool"
            aria-label="Mirror"
            aria-pressed={mirror}
            onClick={props.onMirror}
          >
            <FlipHorizontal size={20} />
            <span>Mirror</span>
          </button>
          <button
            className="tool"
            aria-label="Screenshot"
            onClick={shot}
            disabled={!source}
            aria-keyshortcuts="S"
          >
            <Camera size={20} />
            <span>Screenshot</span>
          </button>
          <button
            className="tool record-tool"
            aria-label={capture.recording ? "Stop recording" : "Record canvas"}
            aria-pressed={capture.recording}
            onClick={capture.toggle}
            disabled={!canRecord}
          >
            {capture.recording ? <Square size={20} /> : <Circle size={20} />}
            <span>{capture.recording ? "Stop" : "Record"}</span>
          </button>
          <button className="tool" aria-label="Fullscreen" onClick={expand}>
            <Expand size={20} />
            <span>Fullscreen</span>
          </button>
        </div>
      </div>
    </div>
  );
}
