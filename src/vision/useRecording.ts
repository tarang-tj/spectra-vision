import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

// Record only the rendered canvas. No microphone, screen capture, or uploads.
export function useRecording(
  canvas: RefObject<HTMLCanvasElement | null>,
  session: string,
  notice: (message: string) => void,
) {
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    alive = useRef(true),
    latestNotice = useRef(notice);
  latestNotice.current = notice;
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  };
  useEffect(() => {
    stop();
  }, [session]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop();
      if (timer.current) clearInterval(timer.current);
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  const start = () => {
    const element = canvas.current;
    if (!element || recorder.current || saving) return;
    if (!element.captureStream || typeof MediaRecorder === "undefined") {
      latestNotice.current(
        "Recording is unavailable. Try current Chrome or Edge.",
      );
      return;
    }
    const mimeType = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/mp4",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      latestNotice.current("No recording format is supported by this browser.");
      return;
    }
    try {
      const media = element.captureStream(24);
      stream.current = media;
      const capture = new MediaRecorder(media, {
        mimeType,
        videoBitsPerSecond: 4_000_000,
      });
      recorder.current = capture;
      const chunks: Blob[] = [];
      let size = 0,
        failed = false;
      const started = performance.now();
      capture.ondataavailable = (event) => {
        if (event.data.size) {
          chunks.push(event.data);
          size += event.data.size;
          if (size >= 32 * 1024 * 1024) stop();
        }
      };
      capture.onerror = () => {
        failed = true;
        stop();
        latestNotice.current("Recording failed. Try a shorter clip.");
      };
      capture.onstop = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        if (!alive.current) return;
        setRecording(false);
        setSaving(false);
        if (failed || !size) return;
        const url = URL.createObjectURL(new Blob(chunks, { type: mimeType })),
          link = document.createElement("a");
        link.href = url;
        link.download = `spectra-${session.split(":")[0]}-${Date.now()}.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        latestNotice.current(
          "Recording saved. Your clip stayed on this device.",
        );
      };
      capture.start(250);
      setSeconds(0);
      setRecording(true);
      timer.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 30) stop();
      }, 250);
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      recorder.current = null;
      latestNotice.current(
        "Recording could not start. Try current Chrome or Edge.",
      );
    }
  };
  const toggle = () => {
    if (recording) {
      setSaving(true);
      stop();
    } else start();
  };
  return { recording, seconds, saving, toggle };
}
