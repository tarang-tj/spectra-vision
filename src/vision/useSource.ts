import { useCallback, useEffect, useRef, useState } from "react";
import { defaultMode, getMode } from "../modes";
import { useCameraSource } from "./camera-source";
import type { CameraHooks } from "./camera-source";
import type { CameraFailure } from "./camera-errors";
import type { Mode, Source } from "./types";

/** What became of a file given to `upload`. `generation` is the one a picture
 * was committed as; null for a video, and for a picture that a newer source
 * overtook while it decoded. Not `ok`: the file could not be read as a
 * picture or a video, and the stage was left exactly as it was. */
export type Opened = { ok: true; generation: number | null } | { ok: false };
const UNREADABLE: Opened = { ok: false };

/** Why there is no source: a camera failure with its cause worked out, or a
 * demo or a file that could not be shown, in words. */
export type SourceProblem =
  | { from: "camera"; failure: CameraFailure }
  | { from: "demo" | "file"; text: string };

export function useSource(hooks: CameraHooks) {
  const [source, setSource] = useState<Source | null>(null),
    [problem, setProblem] = useState<SourceProblem | null>(null),
    [pending, setPending] = useState(false);
  const generation = useRef(0),
    current = useRef<Source | null>(null),
    url = useRef<string | null>(null),
    // Counts uploads, so a picture still decoding knows a later one came.
    attempt = useRef(0);
  const dispose = useCallback(() => {
    const element = current.current?.element;
    if (element instanceof HTMLVideoElement) {
      element.pause();
      const stream = element.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
      element.srcObject = null;
      element.removeAttribute("src");
      element.load();
    }
    if (url.current) {
      URL.revokeObjectURL(url.current);
      url.current = null;
    }
    current.current = null;
  }, []);
  const begin = useCallback(() => {
    generation.current++;
    dispose();
    setSource(null);
    setProblem(null);
    setPending(true);
    return generation.current;
  }, [dispose]);
  const commit = useCallback(
    (
      element: Source["element"],
      kind: Source["kind"],
      label: string,
      token: number,
      camera?: Source["camera"],
    ) => {
      if (token !== generation.current) {
        if (element instanceof HTMLVideoElement)
          (element.srcObject as MediaStream | null)
            ?.getTracks()
            .forEach((t) => t.stop());
        return;
      }
      const value = { element, kind, label, generation: token, camera };
      current.current = value;
      setSource(value);
      setPending(false);
    },
    [],
  );
  const fail = useCallback(
    (reason: SourceProblem, token: number) => {
      if (token !== generation.current) return;
      dispose();
      setSource(null);
      setPending(false);
      setProblem(reason);
    },
    [dispose],
  );
  /** Give up on a source that is still opening (an unanswered camera prompt).
   * Whatever arrives later belongs to an old generation and is released. */
  const cancel = useCallback(() => {
    generation.current++;
    dispose();
    setPending(false);
  }, [dispose]);
  const camera = useCameraSource(
    {
      generation,
      current,
      source,
      problem,
      setProblem,
      begin,
      commit,
      fail,
      cancel,
    },
    hooks,
  );
  const demo = useCallback(
    async (mode: Mode = defaultMode.id, motion = false) => {
      const token = begin();
      // Each mode names its own demo inputs; a mode without a clip stays still.
      const spec = getMode(mode).demo,
        clip = motion ? spec.motion : undefined;
      try {
        if (clip) {
          const video = document.createElement("video");
          video.muted = true;
          video.loop = true;
          video.playsInline = true;
          video.src = `${import.meta.env.BASE_URL}${clip}`;
          current.current = {
            element: video,
            kind: "demo",
            label: "Animated demo · still-photo pan",
            generation: token,
          };
          await video.play();
          commit(video, "demo", "Animated demo · still-photo pan", token);
          return;
        }
        const image = new Image();
        image.src = `${import.meta.env.BASE_URL}${spec.still}`;
        await image.decode();
        commit(image, "demo", spec.label, token);
      } catch {
        fail(
          {
            from: "demo",
            text: "Demo image could not load. Try reloading the page.",
          },
          token,
        );
      }
    },
    [begin, commit, fail],
  );
  const upload = useCallback(
    async (file: File, onTake?: () => void): Promise<Opened> => {
      // `onTake` runs just before the file takes the stage, in the same tick
      // as the stage's own change, and not at all for an unreadable file.
      const isImage = file.type.startsWith("image/");
      if (!isImage && !file.type.startsWith("video/")) return UNREADABLE;
      if (isImage) {
        // A picture is decoded before anything on the stage is touched: a
        // damaged file then leaves what was showing exactly as it was.
        const mine = ++attempt.current,
          was = generation.current,
          objectUrl = URL.createObjectURL(file),
          image = new Image();
        let readable = true;
        try {
          image.src = objectUrl;
          await image.decode();
        } catch {
          readable = false;
        }
        // A camera, a demo or another file was chosen while this one decoded:
        // that choice stands, and this file is dropped without a word.
        const overtaken =
          mine !== attempt.current || was !== generation.current;
        if (!readable || overtaken) {
          URL.revokeObjectURL(objectUrl);
          return overtaken ? { ok: true, generation: null } : UNREADABLE;
        }
        onTake?.();
        const token = begin();
        url.current = objectUrl;
        commit(image, "image", file.name, token);
        return { ok: true, generation: token };
      }
      attempt.current++;
      onTake?.();
      const token = begin();
      try {
        const objectUrl = URL.createObjectURL(file);
        url.current = objectUrl;
        const video = document.createElement("video");
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.src = objectUrl;
        current.current = {
          element: video,
          kind: "video",
          label: file.name,
          generation: token,
        };
        await video.play();
        commit(video, "video", file.name, token);
      } catch {
        fail(
          {
            from: "file",
            text: "This file could not be opened. Try a PNG/JPEG image or a browser-supported video (MP4/WebM).",
          },
          token,
        );
      }
      return { ok: true, generation: null };
    },
    [begin, commit, fail],
  );
  useEffect(() => {
    void demo();
    return () => {
      generation.current++;
      dispose();
    };
  }, [demo, dispose]);
  return { source, problem, pending, demo, camera, upload };
}
