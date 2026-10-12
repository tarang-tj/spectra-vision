/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Granted } from "./camera-start";

/** What a live camera can report: the track ended (unplugged, or taken by
 * the system), the system paused or resumed it, or the picture changed shape
 * (a phone that turns). */
export type CameraEvent = "ended" | "mute" | "unmute" | "resize";

/** The detached video a camera stream plays in, with its listeners attached
 * before it is returned. They live exactly as long as the track and the
 * video do, so there is nothing to remove. */
export function cameraVideo(
  stream: MediaStream,
  on: (event: CameraEvent) => void,
): HTMLVideoElement {
  const track = stream.getVideoTracks()[0],
    video = document.createElement("video");
  track?.addEventListener("ended", () => on("ended"), { once: true });
  track?.addEventListener("mute", () => on("mute"));
  track?.addEventListener("unmute", () => on("unmute"));
  video.addEventListener("resize", () => on("resize"));
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  return video;
}

/** `granted` with the size the video really has, once it has one. The same
 * object comes back when nothing changed, so the page does not redraw. */
export const sized = (granted: Granted, video: HTMLVideoElement): Granted =>
  !video.videoWidth ||
  (video.videoWidth === granted.width && video.videoHeight === granted.height)
    ? granted
    : { ...granted, width: video.videoWidth, height: video.videoHeight };
