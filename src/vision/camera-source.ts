/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  flipWant,
  preferredFacing,
  readChoice,
  startWant,
  subscribePreference,
  writeChoice,
} from "./camera-choice";
import { cameraPermission, useCameraDevices } from "./camera-devices";
import { classify } from "./camera-errors";
import { cameraVideo, sized } from "./camera-live";
import { useCameraRecovery } from "./camera-recover";
import { openCamera, recoveryNote } from "./camera-start";
import type { CameraWant, Granted } from "./camera-start";
import type { Source } from "./types";
import type { SourceProblem } from "./useSource";

// How long a request may sit before the stage says to look for the prompt.
const PROMPT_HINT_MS = 2000;

export type CameraHooks = {
  notice(text: string): void;
  /** A camera went live (the mirror follows which way it faces), or a camera
   * start failed (null). */
  onCamera(granted: Granted | null): void;
};

/** The parts of useSource the camera needs: its generation counter and the
 * begin, commit and fail steps every source goes through. */
export type SourceCore = {
  generation: RefObject<number>;
  current: RefObject<Source | null>;
  source: Source | null;
  problem: SourceProblem | null;
  setProblem: Dispatch<SetStateAction<SourceProblem | null>>;
  begin(): number;
  commit(
    element: HTMLVideoElement,
    kind: "camera",
    label: string,
    token: number,
    camera: Granted,
  ): void;
  fail(reason: SourceProblem, token: number): void;
  cancel(): void;
};

/** The camera as a source: start, pick, flip, retry and cancel, with what the
 * stage needs to say about it (what was granted, a prompt left unanswered, a
 * track the system paused). What to ask for and how to read a failure are
 * plain functions in camera-start.ts, camera-choice.ts and camera-errors.ts. */
export function useCameraSource(core: SourceCore, hooks: CameraHooks) {
  const devices = useCameraDevices(),
    preferred = useSyncExternalStore(subscribePreference, preferredFacing);
  const [granted, setGranted] = useState<Granted | null>(null),
    [picked, setPicked] = useState<CameraWant | null>(null),
    [waiting, setWaiting] = useState(false),
    [muted, setMuted] = useState(false),
    // Goes up when a camera may need play() again (unmuted, tab back on show).
    [wake, setWake] = useState(0);
  const wanted = useRef<CameraWant>({}),
    lostHidden = useRef(false),
    now = useRef({ core, hooks, devices });
  now.current = { core, hooks, devices };
  const open = useCallback(async (want: CameraWant, again = false) => {
    const { core, hooks, devices } = now.current,
      before = core.problem?.from === "camera" && core.problem.failure.code;
    wanted.current = want;
    lostHidden.current = false;
    const token = core.begin(),
      started = performance.now(),
      mine = () => token === core.generation.current;
    let ended = false;
    setGranted(null);
    setMuted(false);
    setWaiting(false);
    const hint = setTimeout(() => mine() && setWaiting(true), PROMPT_HINT_MS);
    try {
      const media = navigator.mediaDevices as MediaDevices | undefined;
      if (!media?.getUserMedia) {
        core.fail(
          { from: "camera", failure: { code: "insecure", detail: "" } },
          token,
        );
        return;
      }
      const opened = await openCamera(want, (c) => media.getUserMedia(c));
      if (!mine()) {
        opened.stream.getTracks().forEach((t) => t.stop());
        return;
      }
      clearTimeout(hint);
      setWaiting(false);
      // Listen before anything is awaited: a track that ends or is paused
      // while the video starts must not be missed.
      const video = cameraVideo(opened.stream, (event) => {
        if (!mine()) return;
        if (event === "resize")
          return setGranted((was) => was && sized(was, video));
        if (event !== "ended") {
          setMuted(event === "mute");
          if (event === "unmute") setWake((n) => n + 1);
          return;
        }
        ended = true;
        lostHidden.current = document.visibilityState === "hidden";
        core.fail(
          { from: "camera", failure: { code: "lost", detail: "" } },
          token,
        );
        hooks.onCamera(null);
        void devices.refresh();
      });
      // Keep ownership while play is pending so cancellation also releases the stream.
      core.current.current = {
        element: video,
        kind: "camera",
        label: "Camera",
        generation: token,
      };
      await video.play();
      if (ended) return;
      const camera = sized(opened.granted, video);
      core.commit(video, "camera", camera.label, token, camera);
      if (!mine()) return;
      setGranted(camera);
      hooks.onCamera(camera);
      writeChoice(camera);
      const note = recoveryNote(want, opened.rung, camera);
      if (note) {
        hooks.notice(note);
        setPicked(null);
      }
      void devices.refresh();
    } catch (e) {
      if (!mine() || ended) return;
      const waitedMs = performance.now() - started,
        permission = await cameraPermission();
      if (!mine()) return;
      const failure = classify(e, { permission, waitedMs });
      core.fail({ from: "camera", failure }, token);
      hooks.onCamera(null);
      // Without a word, a retry that fails the same way looks ignored.
      if (again && failure.code === before)
        hooks.notice("Still the same. Nothing has changed for the camera yet.");
    } finally {
      clearTimeout(hint);
      if (mine()) setWaiting(false);
    }
  }, []);
  const nudge = useCallback(() => setWake((n) => n + 1), []);
  useCameraRecovery(devices, open, wanted, lostHidden, now, nudge);
  const live = core.source?.kind === "camera" ? granted : null,
    // Worked out when one of their parts changes, not on every redraw: the
    // page redraws with each vision result. `granted` is a part because a
    // camera that starts becomes the remembered choice.
    asking = useMemo(
      () => startWant(picked, preferred, readChoice()),
      [picked, preferred, granted],
    ),
    flipTo = useMemo(
      () =>
        live
          ? flipWant(
              live,
              devices.named.map((c) => c.deviceId),
            )
          : null,
      [live, devices.named],
    );
  return {
    live,
    waiting,
    muted,
    wake,
    count: devices.count,
    named: devices.named,
    /** What Start camera will ask for, for the chooser to show. */
    asking,
    start: () => void open(asking),
    /** Choose a camera or a side. While a camera is live it switches now,
     * and comes back to the live one if the chosen one cannot start. */
    pick: (want: CameraWant) => {
      setPicked(want);
      if (live) void open({ ...want, previousId: live.deviceId || undefined });
    },
    flip: flipTo
      ? () => {
          setPicked(flipTo.deviceId ? { deviceId: flipTo.deviceId } : flipTo);
          void open(flipTo);
        }
      : null,
    retry: () => void open(wanted.current, true),
    cancel: () => {
      core.cancel();
      setWaiting(false);
    },
  };
}
