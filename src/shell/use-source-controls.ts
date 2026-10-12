/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useMemo, useState } from "react";
import { defaultMode } from "../modes";
import { hasSides } from "../vision/camera-choice";
import { facingOf, mirrorFor } from "../vision/camera-start";
import { useSource } from "../vision/useSource";

/** Shown as the stage's notice when a chosen file is not a picture. */
export const UNREADABLE_NOTICE =
  "That file could not be read as a picture. The stage is unchanged.";

/** The mode, the source and the three switches that belong to them (paused,
 * mirror, motion demo), with the rules that tie them together: a new source
 * or mode resumes detection, a camera is mirrored unless it faces the room,
 * and a demo source follows the mode. */
export function useSourceControls(notice: (text: string) => void) {
  const [modeId, setModeId] = useState(defaultMode.id),
    [paused, setPaused] = useState(false),
    [mirror, setMirror] = useState(false),
    [motionDemo, setMotionDemo] = useState(false),
    input = useSource({
      notice,
      // Every camera that goes live sets the mirror from the way it faces,
      // whichever path started it; a failed start leaves the mirror off.
      onCamera: (granted) => {
        setMirror(!!granted && mirrorFor(granted.facing));
        if (granted) setPaused(false);
      },
    }),
    { camera } = input;
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
    // `camera.wake` goes up when a camera was unmuted or the tab came back:
    // the browser may have paused the video without the person asking.
  }, [paused, input.source, notice, camera.wake]);
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
      camera.start();
    }
  };
  /** Retry the camera request that failed, exactly as it was asked. Only a
   * camera failure has a retry: a demo that did not load offers the demo. */
  const retrySource = () => {
    setPaused(false);
    if (input.problem?.from === "camera") camera.retry();
  };
  // True where Front and Rear mean something (see hasSides).
  const cameraSides = useMemo(
    () =>
      hasSides(navigator.maxTouchPoints > 0, camera.count, [
        ...camera.named.map((c) => facingOf({}, c.label)),
        ...(camera.live ? [camera.live.facing] : []),
      ]),
    [camera.count, camera.named, camera.live],
  );
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
    retrySource,
    /** Go to the other camera, where there is one to go to. */
    flipCamera:
      camera.flip && (navigator.maxTouchPoints > 0 || camera.count > 1)
        ? camera.flip
        : undefined,
    cameraSides,
    onUpload,
    loadPicture,
  };
}
