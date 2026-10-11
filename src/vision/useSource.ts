import { useCallback, useEffect, useRef, useState } from "react";
import { defaultMode, getMode } from "../modes";
import type { Mode, Source } from "./types";

/** What became of a file given to `upload`. `generation` is the one a picture
 * was committed as; null for a video, and for a picture that a newer source
 * overtook while it decoded. Not `ok`: the file could not be read as a
 * picture or a video, and the stage was left exactly as it was. */
export type Opened = { ok: true; generation: number | null } | { ok: false };
const UNREADABLE: Opened = { ok: false };

export function useSource() {
  const [source, setSource] = useState<Source | null>(null),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
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
    setError("");
    setPending(true);
    return generation.current;
  }, [dispose]);
  const commit = useCallback(
    (
      element: Source["element"],
      kind: Source["kind"],
      label: string,
      token: number,
    ) => {
      if (token !== generation.current) {
        if (element instanceof HTMLVideoElement)
          (element.srcObject as MediaStream | null)
            ?.getTracks()
            .forEach((t) => t.stop());
        return;
      }
      const value = { element, kind, label, generation: token };
      current.current = value;
      setSource(value);
      setPending(false);
    },
    [],
  );
  const fail = useCallback(
    (reason: unknown, token: number) => {
      if (token !== generation.current) return;
      dispose();
      setSource(null);
      setPending(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    },
    [dispose],
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
          new Error("Demo image could not load. Try reloading the page."),
          token,
        );
      }
    },
    [begin, commit, fail],
  );
  const camera = useCallback(
    async (deviceId?: string) => {
      const token = begin();
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Camera needs HTTPS or localhost and a supported browser.",
          );
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            ...(deviceId
              ? { deviceId: { exact: deviceId } }
              : { facingMode: "user" }),
          },
          audio: false,
        });
        if (token !== generation.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = document.createElement("video");
        video.muted = true;
        video.playsInline = true;
        video.srcObject = stream;
        // Keep ownership while play is pending so cancellation also releases the stream.
        current.current = {
          element: video,
          kind: "camera",
          label: "Camera",
          generation: token,
        };
        await video.play();
        commit(
          video,
          "camera",
          stream.getVideoTracks()[0]?.label || "Camera",
          token,
        );
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          if (token === generation.current)
            setCameras(devices.filter((d) => d.kind === "videoinput"));
        } catch {
          /* Camera can work even when device enumeration is unavailable. */
        }
        stream.getVideoTracks()[0]?.addEventListener(
          "ended",
          () => {
            if (token === generation.current) {
              dispose();
              setSource(null);
              setError("Camera disconnected. Reconnect it or try a demo.");
            }
          },
          { once: true },
        );
      } catch (e) {
        const name = (e as DOMException).name;
        fail(
          new Error(
            name === "NotAllowedError"
              ? "Camera permission was denied. Allow camera access in your browser, or use Upload / Demo."
              : name === "NotFoundError"
                ? "No camera found. Connect a camera, or use Upload / Demo."
                : name === "NotReadableError"
                  ? "Camera is busy. Close other camera apps and try again."
                  : (e as Error).message,
          ),
          token,
        );
      }
    },
    [begin, commit, dispose, fail],
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
          new Error(
            "This file could not be opened. Try a PNG/JPEG image or a browser-supported video (MP4/WebM).",
          ),
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
  return { source, error, pending, cameras, demo, camera, upload };
}
