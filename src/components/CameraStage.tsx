/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, PointerEvent, ReactNode, RefObject } from "react";
import { LoaderCircle, Pause, Play } from "lucide-react";
import { downloadBlob } from "../download";
import type { ModeDef } from "../modes";
import { stageHooks } from "../stage/stage-hooks";
import { useStageLoop } from "../stage/use-stage-loop";
import type { FrameData } from "../vision/frame";
import { grantedText } from "../vision/camera-start";
import type { Granted } from "../vision/camera-start";
import type { StageCard } from "../shell/stage-card";
import { useClipRecorder } from "../shell/use-clip-recorder";
import type { Clip } from "../shell/use-clip-recorder";
import StageMessage, { StageWaiting } from "./StageMessage";
import StageTools from "./StageTools";

/** What the keyboard shortcuts and the command palette may ask of the stage. */
export type StageActions = { record(): void; screenshot(): void };

/** What the stage shows and offers for a camera. */
export type StageCamera = {
  /** What the browser granted, while a camera is live. */
  live: Granted | null;
  /** The system paused the live camera (a call, another app). */
  muted: boolean;
  /** A camera request has gone unanswered long enough to say so. */
  waiting: boolean;
  onCancel: () => void;
  /** Present when there is another camera to go to. */
  onFlip?: () => void;
};

// A portrait camera picture gets a portrait stage on a phone, but never one
// taller than this: the tools under the stage must stay within reach.
const TALLEST = 3 / 4;

export default function CameraStage(props: {
  mode: ModeDef;
  /** Source, latest result, tracks, mirror and settings for the renderer. */
  data: FrameData;
  paused: boolean;
  onPause: () => void;
  onMirror: () => void;
  status: string;
  /** The error card, or null when nothing has failed. */
  card: StageCard | null;
  onRetry: () => void;
  camera: StageCamera;
  onDemo: () => void;
  notice: (text: string) => void;
  /** Filled by the stage so the shell can trigger Record and Screenshot. */
  actions: RefObject<StageActions | null>;
  /** A finished recording, for the share card. */
  onClip: (clip: Clip) => void;
  /** Shell overlays that belong on the stage (the first-run tips). */
  children?: ReactNode;
}) {
  const { mode, paused, status, card, camera, onRetry, onDemo, notice } = props,
    { source, mirror, aspect } = props.data;
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
  // A phone browser moves a touch that lands near a button onto the button
  // (Chrome's touch adjustment: within about 8 px it retargets the whole
  // touch, pointerdown included, to the nearest element that answers a
  // click). It leaves a touch alone when the element under the finger answers
  // clicks itself, and it only counts listeners on the element, which React's
  // do not have. So while a panel takes presses on the picture the canvas
  // gets a click listener of its own, and a press on the picture stays on it
  // right down to the edge of the stage buttons.
  useEffect(() => {
    const element = canvas.current;
    if (!measuring || !element) return;
    const answersClicks = () => {};
    element.addEventListener("click", answersClicks);
    return () => element.removeEventListener("click", answersClicks);
  }, [measuring]);
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
      downloadBlob(`spectra-${mode.id}-${Date.now()}.png`, blob);
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
      // Capture can throw for a pointer that has already gone; the drag then
      // simply ends at the canvas edge.
      if (type === "down")
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* pointer no longer active */
        }
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
      ? grantedText(camera.live ?? { facing: "unknown", width: 0, height: 0 })
      : source?.kind === "demo"
        ? source.element instanceof HTMLVideoElement
          ? "ANIMATED DEMO"
          : "DEMO IMAGE"
        : source?.kind === "video"
          ? "LOCAL VIDEO"
          : "LOCAL IMAGE";
  // Read by the narrow-screen rule in stage.css; wide screens ignore it.
  const portrait =
    source?.kind === "camera" && aspect < 1
      ? ({ "--stage-portrait": Math.max(aspect, TALLEST) } as CSSProperties)
      : undefined;
  return (
    <div
      className={`camera-stage ${fullscreen ? "is-fullscreen" : ""} ${card ? "has-card" : ""}`}
      style={portrait}
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
      {camera.muted && source?.kind === "camera" && (
        <div className="stage-note" role="status">
          Camera paused by the system. It resumes by itself.
        </div>
      )}
      {card ? (
        <StageMessage card={card} onRetry={onRetry} onDemo={onDemo} />
      ) : camera.waiting ? (
        <StageWaiting onCancel={camera.onCancel} />
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
        <StageTools
          hasSource={!!source}
          mirror={mirror}
          recording={capture.recording}
          canRecord={canRecord}
          onDemo={onDemo}
          onClear={
            mode.clearable
              ? () => {
                  loop.clear();
                  notice("Light trails cleared.");
                }
              : undefined
          }
          onFlip={source?.kind === "camera" ? camera.onFlip : undefined}
          onMirror={props.onMirror}
          onShot={shot}
          onRecord={capture.toggle}
          onExpand={expand}
        />
      </div>
    </div>
  );
}
