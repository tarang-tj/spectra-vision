/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What to ask the browser for when a camera is started, and how to read what
// it gave. Everything here is a plain function: the hook in camera-source.ts
// only runs it.

export type Facing = "user" | "environment";

/** What the person (or the remembered choice) wants. `deviceId` is one named
 * camera; `previousId` is the camera that was live when another was asked
 * for, tried next after a named one so a failed switch does not leave an
 * empty stage; `facing` is the side to ask for when no id works. */
export type CameraWant = {
  deviceId?: string;
  previousId?: string;
  facing?: Facing;
  /** True when `deviceId` is the camera used last time, not one just picked. */
  remembered?: boolean;
  /** Set when the remembered camera never said which way it faces: `facing`
   * is then only what to ask for next, not a side to show as chosen. */
  sideUnknown?: true;
};

/** What the browser granted, read from the live track. */
export type Granted = {
  deviceId: string;
  label: string;
  facing: Facing | "unknown";
  width: number;
  height: number;
  frameRate: number;
};

/** Which rung of the ladder a request is: the chosen camera, the one that was
 * live before, a side of the device, or anything at all. */
export type Rung = "chosen" | "previous" | "facing" | "any";
export type CameraRequest = { rung: Rung; video: MediaTrackConstraints | true };

// A size the models can keep up with. `ideal` can never make a request fail.
const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

/** The requests to try, in order. An exact id can fail (the camera was
 * unplugged, or the browser changed its ids), so it is never the last rung.
 * The side is asked for as `ideal`, never `exact`: a laptop with no rear
 * camera still starts. */
export function cameraRequests(want: CameraWant): CameraRequest[] {
  const byId = (rung: Rung, id: string): CameraRequest => ({
      rung,
      video: { ...SIZE, deviceId: { exact: id } },
    }),
    list: CameraRequest[] = [];
  if (want.deviceId) list.push(byId("chosen", want.deviceId));
  if (want.deviceId && want.previousId && want.previousId !== want.deviceId)
    list.push(byId("previous", want.previousId));
  list.push({
    rung: "facing",
    video: { ...SIZE, facingMode: { ideal: want.facing ?? "user" } },
  });
  list.push({ rung: "any", video: true });
  return list;
}

/** True for the two failures that mean "not this camera": the next rung may
 * still work. A refusal or a busy camera would only fail again, or prompt
 * again, so those stop the ladder. */
export const triesNextRung = (errorName: string): boolean =>
  errorName === "OverconstrainedError" || errorName === "NotFoundError";

/** Which way a camera faces: what the live track says, else the one side its
 * capabilities list (a camera may list both, which says nothing), else what
 * its name says, else unknown (a laptop webcam says none of these). */
export function facingOf(
  settings: { facingMode?: string },
  label: string,
  capable?: readonly string[],
): Granted["facing"] {
  if (settings.facingMode === "user" || settings.facingMode === "environment")
    return settings.facingMode;
  const only = capable?.length === 1 ? capable[0] : "";
  if (only === "user" || only === "environment") return only;
  if (/\b(back|rear|environment)\b/i.test(label)) return "environment";
  if (/\b(front|selfie)\b/i.test(label)) return "user";
  return "unknown";
}

export function grantedOf(
  settings: MediaTrackSettings,
  label: string,
  capable?: readonly string[],
): Granted {
  return {
    deviceId: settings.deviceId ?? "",
    label: label || "Camera",
    facing: facingOf(settings, label, capable),
    width: settings.width ?? 0,
    height: settings.height ?? 0,
    frameRate: Math.round(settings.frameRate ?? 0),
  };
}

/** A camera that looks back at the person is shown as a mirror; one that
 * looks at the room never is, or writing in the room would read backwards. */
export const mirrorFor = (facing: Granted["facing"]): boolean =>
  facing !== "environment";

/** What to tell the person about a camera that is mirrored on a guess: only
 * where the device has sides, so a desk webcam gets no note. */
export const unknownSideNote = (
  facing: Granted["facing"],
  sidesMatter: boolean,
): string | null =>
  facing === "unknown" && sidesMatter
    ? "This camera does not say which way it faces, so it is shown mirrored. Press Mirror if it points away from you."
    : null;

/** What the stage badge says about a live camera: the side when it is known,
 * and the size the picture really has. */
export function grantedText(
  granted: Pick<Granted, "facing" | "width" | "height">,
): string {
  const side =
      granted.facing === "environment"
        ? "REAR"
        : granted.facing === "user"
          ? "FRONT"
          : "",
    size =
      granted.width && granted.height
        ? `${granted.width}×${granted.height}`
        : "";
  return ["CAMERA", side, size].filter(Boolean).join(" · ");
}

/** What to tell the person when the camera that started is not the one that
 * was asked for, or null when it is. */
export function recoveryNote(
  want: CameraWant,
  rung: Rung,
  granted: Pick<Granted, "deviceId" | "label">,
): string | null {
  if (want.deviceId && rung !== "chosen") {
    const what = want.remembered ? "The camera used last time" : "That camera";
    return rung === "previous"
      ? `${what} is not available. Back on ${granted.label}.`
      : `${what} is not available. Using ${granted.label}.`;
  }
  // A flip that came back with the camera it left.
  if (!want.deviceId && want.previousId && granted.deviceId === want.previousId)
    return "There is no other camera to flip to.";
  return null;
}

export type OpenedCamera = {
  stream: MediaStream;
  rung: Rung;
  granted: Granted;
};

/** Walk the ladder. Resolves with the first stream a rung gives; rejects with
 * the error that stopped it (the last rung's, when every rung was tried). */
export async function openCamera(
  want: CameraWant,
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>,
): Promise<OpenedCamera> {
  const requests = cameraRequests(want);
  for (const [i, request] of requests.entries()) {
    try {
      const stream = await getUserMedia({ video: request.video, audio: false }),
        track = stream.getVideoTracks()[0];
      return {
        stream,
        rung: request.rung,
        granted: grantedOf(
          track?.getSettings() ?? {},
          track?.label ?? "",
          // Not every browser has getCapabilities; a missing side is allowed.
          track?.getCapabilities?.().facingMode,
        ),
      };
    } catch (e) {
      const name = (e as { name?: string } | null)?.name ?? "";
      if (i === requests.length - 1 || !triesNextRung(name)) throw e;
    }
  }
  throw new Error("No camera request was made.");
}
