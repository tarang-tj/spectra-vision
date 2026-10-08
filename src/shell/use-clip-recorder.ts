/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

/** A finished recording, handed to the share card. `url` is an object URL the
 * receiver must revoke. */
export type Clip = { url: string; mime: string; seconds: number; file: string };

// The stage's recorder: src/vision/useRecording.ts with one addition, the
// finished clip is also handed to `onClip` so the share card can play it.
// Record only the rendered canvas. No microphone, screen capture, or uploads.
export function useClipRecorder(
  canvas: RefObject<HTMLCanvasElement | null>,
  session: string,
  notice: (message: string) => void,
  onClip: (clip: Clip) => void,
) {
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [saving, setSaving] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setInterval> | null>(null),
    alive = useRef(true),
    latestNotice = useRef(notice),
    latestClip = useRef(onClip);
  latestNotice.current = notice;
  latestClip.current = onClip;
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
        const blob = new Blob(chunks, { type: mimeType }),
          url = URL.createObjectURL(blob),
          link = document.createElement("a"),
          file = `spectra-${session.split(":")[0]}-${Date.now()}.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
        link.href = url;
        link.download = file;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        latestNotice.current(
          "Recording saved. Your clip stayed on this device.",
        );
        // A second URL for the share card, which outlives the download link.
        latestClip.current({
          url: URL.createObjectURL(blob),
          mime: mimeType.split(";")[0],
          seconds: Math.round((performance.now() - started) / 1000),
          file,
        });
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
