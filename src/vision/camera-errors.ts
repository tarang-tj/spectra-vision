/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Why a camera did not start, worked out once from the browser's error, and
// the words the stage shows for each cause. Plain functions, no browser calls.

export type CameraErrorCode =
  | "blocked" // refused for this site
  | "dismissed" // the browser's prompt was closed without an answer
  | "system-blocked" // the browser says the operating system refused
  | "refused" // the site is allowed, yet refused, and the browser does not say why
  | "none" // no camera on this device
  | "busy" // another app or tab holds it
  | "gone" // the camera asked for is not there, and nothing else answered
  | "insecure" // no camera API on this page (not HTTPS, or an old browser)
  | "lost" // a live camera stopped
  | "unknown";

/** The browser's own answer about the camera permission, or "unknown" where
 * it cannot be asked (Firefox does not know the name "camera"). */
export type Permission = PermissionState | "unknown";

export type CameraFailure = { code: CameraErrorCode; detail: string };

// A person takes at least this long to read a prompt and close it. A refusal
// that comes back sooner was the browser's own, with no prompt shown.
const PROMPT_MS = 700;

/** Sort a getUserMedia failure. `waitedMs` is how long the request was
 * pending; `permission` is the permission state read after it failed. */
export function classify(
  error: unknown,
  context: { permission: Permission; waitedMs: number },
): CameraFailure {
  const name = String((error as { name?: unknown } | null)?.name ?? ""),
    message = String((error as { message?: unknown } | null)?.message ?? ""),
    detail = [name, message].filter(Boolean).join(": ") || String(error);
  const code = ((): CameraErrorCode => {
    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      if (/system/i.test(message)) return "system-blocked";
      // Allowed for the site and still refused: most often the system, but
      // only a browser that says so is taken at its word.
      if (context.permission === "granted") return "refused";
      if (context.permission === "prompt" && context.waitedMs >= PROMPT_MS)
        return "dismissed";
      return "blocked";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError")
      return "none";
    if (
      name === "NotReadableError" ||
      name === "TrackStartError" ||
      name === "AbortError"
    )
      return "busy";
    if (name === "OverconstrainedError") return "gone";
    return "unknown";
  })();
  return { code, detail };
}

/** The card after the permission changed while it was on show: a block that
 * was lifted back to "ask" becomes the ask-again card, and the reverse. */
export function afterPermissionChange(
  code: CameraErrorCode,
  permission: Permission,
): CameraErrorCode {
  if (code !== "blocked" && code !== "dismissed") return code;
  return permission === "denied"
    ? "blocked"
    : permission === "prompt"
      ? "dismissed"
      : code;
}

export type Platform = "ios" | "android" | "desktop";

/** Where the person is, for the one sentence that differs: where a blocked
 * camera is allowed again. An iPad says it is a Mac, but a Mac has no touch. */
export function platformOf(userAgent: string, touchPoints: number): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && touchPoints > 1) return "ios";
  return /Android/.test(userAgent) ? "android" : "desktop";
}

const UNBLOCK: Record<Platform, string> = {
  desktop:
    "Open the site settings from the address bar, set Camera to Allow, then retry. You can also carry on without a camera.",
  android:
    "Tap the icon beside the address, open Permissions, set Camera to Allow, then retry.",
  ios: "Open Website Settings from the address bar menu, set Camera to Allow, then retry.",
};

const SYSTEM: Record<Platform, string> = {
  desktop:
    "Open the system privacy settings, let this browser use the camera, then retry.",
  android:
    "Open the phone's Settings, find this browser under Apps, allow Camera, then retry.",
  ios: "Open the Settings app, find this browser, turn Camera on, then retry.",
};

export type CameraCard = {
  title: string;
  text: string;
  /** The longer how-to, or "" when the text says it all. */
  fix: string;
  /** The retry button's words; null when trying again cannot help. */
  retry: string | null;
};

/** The stage's words for a camera failure. Each cause has its own heading,
 * says what happened once, and names what the person can do. */
export function cameraCard(
  failure: CameraFailure,
  platform: Platform,
): CameraCard {
  switch (failure.code) {
    case "blocked":
      return {
        title: "Camera access is blocked.",
        text: "Camera permission was denied for this site. Allow it in your browser, or use Upload or Demo.",
        fix: UNBLOCK[platform],
        retry: "Retry camera",
      };
    case "dismissed":
      return {
        title: "The camera prompt was closed.",
        text: "The browser asked to use the camera and got no answer. Ask again and choose Allow, or use Upload or Demo.",
        fix: "",
        retry: "Ask again",
      };
    case "system-blocked":
      return {
        title: "Your device is blocking the camera.",
        text: "This site may use the camera, but the system is not letting the browser reach it.",
        fix: SYSTEM[platform],
        retry: "Retry camera",
      };
    case "refused":
      return {
        title: "Camera access is blocked.",
        text: "Camera permission was denied, though this site is allowed to use the camera.",
        fix:
          platform === "desktop"
            ? "Open the site settings from the address bar and set Camera to Allow. If it already is, let this browser use the camera in the system privacy settings, then retry."
            : `The block is most likely on the device. ${SYSTEM[platform]}`,
        retry: "Retry camera",
      };
    case "none":
      return {
        title: "No camera found.",
        text: "Connect one and it starts by itself, or use Upload or Demo.",
        fix: "",
        retry: "Retry camera",
      };
    case "busy":
      return {
        title: "The camera is in use.",
        text: "Another app or tab may be holding it. Close it there, then retry.",
        fix: "",
        retry: "Retry camera",
      };
    case "gone":
      return {
        title: "That camera is no longer connected.",
        text: "Plug it back in and retry, or use Upload or Demo.",
        fix: "",
        retry: "Retry camera",
      };
    case "insecure":
      return {
        title: "The camera needs a secure page.",
        text: "Open this page over HTTPS in a current browser. Upload and Demo work here.",
        fix: "",
        retry: null,
      };
    case "lost":
      return {
        title: "The camera went away.",
        text: "It was unplugged, or the system took it. Reconnect it, then retry.",
        fix: "",
        retry: "Retry camera",
      };
    default:
      return {
        title: "The camera did not start.",
        text: `The browser reported: ${failure.detail || "no reason"}.`,
        fix: "",
        retry: "Retry camera",
      };
  }
}
