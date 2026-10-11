/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useState } from "react";
import { defaultMode } from "../modes";
import { useSource } from "../vision/useSource";

/** Shown as the stage's notice when a chosen file is not a picture. */
export const UNREADABLE_NOTICE =
  "That file could not be read as a picture. The stage is unchanged.";

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
  /** Open a file, and say so when it could not be read: the stage keeps
   * what it was showing, so without a word the press would look ignored.
   * The switches are reset only when the file does take the stage. */
  const open = async (file: File): Promise<number | null> => {
    const opened = await input.upload(file, () => {
      setPaused(false);
      setMotionDemo(false);
      setMirror(false);
    });
    if (opened.ok) return opened.generation;
    notice(UNREADABLE_NOTICE);
    return null;
  };
  const onUpload = (file: File) => void open(file);
  /** Put a stored still picture on the stage through the upload path, and
   * give the generation it became. Rejects when it could not be shown. */
  const loadPicture = async (blob: Blob, label: string): Promise<number> => {
    const file =
        blob instanceof File
          ? blob
          : new File([blob], label, { type: blob.type }),
      picture = blob.type.startsWith("image/"),
      generation = picture ? await open(file) : null;
    if (!picture) notice(UNREADABLE_NOTICE);
    if (generation === null)
      throw new Error("That picture could not be opened.");
    return generation;
  };
  return {
    input,
    modeId,
    paused,
    setPaused,
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
    loadPicture,
  };
}
