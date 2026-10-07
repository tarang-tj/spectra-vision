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
import type { Mode, Source, Track, VisionResult } from "../vision/types";
import { MODE_LABELS, COLORS } from "../vision/types";
import { isPinching } from "../vision/geometry";
import { draw } from "../vision/render";
import type { Stroke } from "../vision/render";
import { useRecording } from "../vision/useRecording";
export default function CameraStage(props: {
  source: Source | null;
  mode: Mode;
  result: VisionResult | null;
  tracks: Track[];
  paused: boolean;
  onPause: () => void;
  mirror: boolean;
  onMirror: () => void;
  trails: boolean;
  constellation: boolean;
  selected: number | null;
  status: string;
  error: string;
  onRetry: () => void;
  retryLabel: string;
  onDemo: () => void;
  notice: (text: string) => void;
}) {
  const {
    source,
    mode,
    result,
    paused,
    mirror,
    trails,
    status,
    error,
    onRetry,
    onDemo,
    notice,
  } = props;
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null),
    latest = useRef(props),
    strokes = useRef<Stroke[]>([]),
    pinches = useRef<boolean[]>([]),
    active = useRef<(Stroke | null)[]>([]);
  const [fullscreen, setFullscreen] = useState(false);
  const capture = useRecording(
    canvas,
    `${mode}:${source?.generation ?? 0}`,
    notice,
  );
  latest.current = props;
  useEffect(() => {
    strokes.current = [];
    pinches.current = [];
    active.current = [];
  }, [mode, source?.generation]);
  useEffect(() => {
    if (!result || !trails) return;
    if (mode === "body") {
      const points = result.landmarks[0];
      if (!points) {
        active.current = [];
        return;
      }
      [15, 16, 27, 28].forEach((joint, i) => {
        const p = points[joint];
        if (!p || (p.visibility ?? 1) < 0.4) {
          active.current[i] = null;
          return;
        }
        if (!active.current[i]) {
          const stroke = { points: [], color: COLORS[i % COLORS.length] };
          strokes.current.push(stroke);
          active.current[i] = stroke;
        }
        const stroke = active.current[i]!;
        const last = stroke.points.at(-1);
        if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.002)
          stroke.points.push({ ...p });
        if (stroke.points.length > 64) stroke.points.shift();
      });
      if (strokes.current.length > 40)
        strokes.current.splice(0, strokes.current.length - 40);
      return;
    }
    if (mode !== "hands") return;
    const e = source?.element,
      aspect =
        e instanceof HTMLVideoElement
          ? e.videoWidth / e.videoHeight
          : e instanceof HTMLImageElement
            ? e.naturalWidth / e.naturalHeight
            : 1;
    result.landmarks.forEach((points, i) => {
      const pinching = isPinching(points, pinches.current[i] ?? false, aspect);
      if (pinching) {
        if (!pinches.current[i] || !active.current[i]) {
          const stroke = { points: [], color: COLORS[i % COLORS.length] };
          strokes.current.push(stroke);
          active.current[i] = stroke;
        }
        const tip = points[8],
          stroke = active.current[i]!;
        const last = stroke.points.at(-1);
        if (!last || Math.hypot(tip.x - last.x, tip.y - last.y) > 0.002)
          stroke.points.push({ ...tip });
        if (stroke.points.length > 500) stroke.points.shift();
      } else active.current[i] = null;
      pinches.current[i] = pinching;
    });
    for (let i = result.landmarks.length; i < pinches.current.length; i++) {
      pinches.current[i] = false;
      active.current[i] = null;
    }
    if (strokes.current.length > 40) strokes.current.shift();
  }, [result, mode, source, trails]);
  useEffect(() => {
    if (!trails) {
      active.current = [];
      pinches.current = [];
    }
  }, [trails]);
  useEffect(() => {
    let raf = 0,
      stopped = false,
      lastDraw = 0;
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const render = (time: number) => {
      if (stopped) return;
      if (time - lastDraw < 32) {
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
          const p = latest.current;
          draw(
            context,
            rect.width,
            rect.height,
            p.source,
            p.mode,
            p.result,
            p.tracks,
            p.mirror,
            p.trails,
            strokes.current,
            p.selected,
            p.paused || reducedMotion.matches ? 0 : time,
            p.constellation,
          );
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, []);
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
      a.download = `spectra-${mode}-${Date.now()}.png`;
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
      <canvas
        ref={canvas}
        aria-label={`${MODE_LABELS[mode]} canvas`}
        role="img"
      />
      <div className="stage-top">
        <span className="hud-badge">
          <i className={source?.kind === "camera" ? "live-dot" : ""} />
          {source ? badge : "NO SOURCE"}
        </span>
        <span className="hud-badge mode-badge">{MODE_LABELS[mode]}</span>
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
          {mode === "hands" && (
            <button
              className="tool"
              onClick={() => {
                strokes.current = [];
                active.current = [];
                pinches.current = [];
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
