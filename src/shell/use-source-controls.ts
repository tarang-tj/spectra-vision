/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useState } from "react";
import { defaultMode } from "../modes";
import { useSource } from "../vision/useSource";

/** The mode, the source and the three switches that belong to them (paused,
 * mirror, motion demo), with the rules that tie them together: a new source
 * or mode resumes detection, a camera starts mirrored, and a demo source
 * follows the mode. */
export function useSourceControls(notice: (text: string) => void) {
  const [modeId, setModeId] = useState(defaultMode.id),
    [paused, setPaused] = useState(false),
    [mirror, setMirror] = useState(false),
    [motionDemo, setMotionDemo] = useState(false),
    input = useSource();
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
  }, [paused, input.source, notice]);
  const onMode = (next: string) => {
    if (next === modeId) return;
    setModeId(next);
    setPaused(false);
    if (input.source?.kind === "demo") void input.demo(next, motionDemo);
  };
  const onDemo = () => {
    setPaused(false);
    setMirror(false);
    void input.demo(modeId, motionDemo);
  };
  const onMotionDemo = () => {
    const next = !motionDemo;
    setMotionDemo(next);
    setPaused(false);
    setMirror(false);
    void input.demo(modeId, next);
  };
  const onCamera = () => {
    setPaused(false);
    if (input.source?.kind === "camera") onDemo();
    else {
      setMotionDemo(false);
      setMirror(true);
      void input.camera();
    }
  };
  /** Open a camera by device id, or the default one (also the retry path). */
  const openCamera = (deviceId?: string) => {
    setPaused(false);
    void input.camera(deviceId);
  };
  const onUpload = (file: File) => {
    setPaused(false);
    setMotionDemo(false);
    setMirror(false);
    void input.upload(file);
  };
  return {
    input,
    modeId,
    paused,
    mirror,
    motionDemo,
    togglePaused: () => setPaused((p) => !p),
    toggleMirror: () => setMirror((m) => !m),
    onMode,
    onDemo,
    onMotionDemo,
    onCamera,
    openCamera,
    onUpload,
  };
}
