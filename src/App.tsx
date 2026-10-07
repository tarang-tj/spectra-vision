import { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import CameraStage from "./components/CameraStage";
import Inspector from "./components/Inspector";
import Footer from "./components/Footer";
import { useSource } from "./vision/useSource";
import { useVision } from "./vision/useVision";
import { Tracker } from "./vision/tracker";
import type { Mode, Track } from "./vision/types";
export default function App() {
  const [mode, setMode] = useState<Mode>("objects"),
    [paused, setPaused] = useState(false),
    [mirror, setMirror] = useState(false),
    [trails, setTrails] = useState(true),
    [confidence, setConfidence] = useState(0.45),
    [selected, setSelected] = useState<number | null>(null),
    [tracks, setTracks] = useState<Track[]>([]),
    [fps, setFps] = useState<number | null>(null),
    [help, setHelp] = useState(false),
    [toast, setToast] = useState("");
  const input = useSource(),
    vision = useVision(mode, input.source, paused, confidence),
    tracker = useRef(new Tracker()),
    history = useRef<unknown[]>([]),
    previous = useRef<number | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notice = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    tracker.current.reset();
    setTracks([]);
    setSelected(null);
    setFps(null);
    previous.current = null;
    history.current = [];
  }, [mode, input.source?.generation]);
  useEffect(() => {
    const r = vision.result;
    if (!r) return;
    if (previous.current !== null) {
      const instant = 1000 / (r.time - previous.current);
      setFps((old) => (old === null ? instant : old * 0.8 + instant * 0.2));
    }
    previous.current = r.time;
    setTracks(tracker.current.update(r.detections, r.time));
    history.current.push({
      elapsedMs: Math.round(r.time),
      latencyMs: r.latency,
      detections: r.detections,
      landmarks: r.landmarks,
      handedness: r.handedness,
    });
    if (history.current.length > 1000) history.current.shift();
  }, [vision.result]);
  useEffect(() => {
    const video = input.source?.element;
    if (video instanceof HTMLVideoElement) {
      if (paused) video.pause();
      else
        void video
          .play()
          .catch(() =>
            notice("Playback could not resume. Choose the file again."),
          );
    }
  }, [paused, input.source]);
  const onMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setPaused(false);
    if (input.source?.kind === "demo") void input.demo(next);
  };
  const onDemo = () => {
    setPaused(false);
    setMirror(false);
    void input.demo(mode);
  };
  const onCamera = () => {
    setPaused(false);
    if (input.source?.kind === "camera") onDemo();
    else {
      setMirror(true);
      void input.camera();
    }
  };
  const onUpload = (file: File) => {
    setPaused(false);
    setMirror(false);
    void input.upload(file);
  };
  const exportSession = () => {
    const payload = {
      app: "SPECTRA",
      version: "1.0.0",
      exportedAt: new Date().toISOString(),
      mode,
      source: input.source?.kind ?? null,
      settings: { confidence, mirror, trails },
      notes:
        "Latest 1000 processed frames of this source and mode. Image-normalized coordinates; no media included. Timestamps are monotonic page time.",
      frames: history.current,
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = `spectra-${mode}-session.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice("Session exported.");
  };
  const count =
    mode === "objects" ? tracks.length : (vision.result?.landmarks.length ?? 0);
  return (
    <main className="app">
      <Header
        mode={mode}
        onMode={onMode}
        cameraActive={input.source?.kind === "camera"}
        onCamera={onCamera}
        onUpload={onUpload}
        pending={input.pending}
      />
      {input.source?.kind === "camera" && input.cameras.length > 1 && (
        <label className="camera-picker">
          Camera{" "}
          <select
            aria-label="Camera source"
            value={
              (input.source.element as HTMLVideoElement).srcObject instanceof
              MediaStream
                ? (
                    (input.source.element as HTMLVideoElement)
                      .srcObject as MediaStream
                  )
                    .getVideoTracks()[0]
                    ?.getSettings().deviceId
                : ""
            }
            onChange={(e) => {
              setPaused(false);
              void input.camera(e.target.value);
            }}
          >
            {input.cameras.map((c, i) => (
              <option value={c.deviceId} key={c.deviceId}>
                {c.label || `Camera ${i + 1}`}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="workspace">
        <CameraStage
          source={input.source}
          mode={mode}
          result={vision.result}
          tracks={tracks}
          paused={paused}
          onPause={() => setPaused((p) => !p)}
          mirror={mirror}
          onMirror={() => setMirror((m) => !m)}
          trails={trails}
          selected={mode === "objects" ? selected : null}
          status={input.pending ? "Opening source" : vision.status}
          error={input.error || vision.error}
          onRetry={
            input.error
              ? () => {
                  setPaused(false);
                  void input.camera();
                }
              : vision.retry
          }
          retryLabel={input.error ? "Retry camera" : "Retry model"}
          onDemo={onDemo}
          notice={notice}
        />
        <Inspector
          mode={mode}
          tracks={tracks}
          result={vision.result}
          confidence={confidence}
          onConfidence={setConfidence}
          trails={trails}
          onTrails={() => setTrails((t) => !t)}
          selected={selected}
          onSelect={setSelected}
          mirror={mirror}
          aspect={
            input.source?.element instanceof HTMLVideoElement
              ? input.source.element.videoWidth /
                input.source.element.videoHeight
              : input.source?.element instanceof HTMLImageElement
                ? input.source.element.naturalWidth /
                  input.source.element.naturalHeight
                : 1
          }
        />
      </div>
      <Footer
        latency={vision.result?.latency ?? null}
        fps={paused ? 0 : fps}
        count={count}
        onExport={exportSession}
        help={help}
        onHelp={() => setHelp((h) => !h)}
      />
      {toast && (
        <div role="status" className="toast">
          {toast}
        </div>
      )}
    </main>
  );
}
