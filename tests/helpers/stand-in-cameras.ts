/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Stand-in cameras for the browser tests. Chrome's own fake camera is one
// landscape webcam that says nothing about which way it faces, so a phone's
// front and rear cameras, a portrait picture, a camera that is unplugged and
// a prompt nobody answers cannot happen with it. These are canvases behind
// getUserMedia: they show what the APP does with such cameras. They are not a
// phone, and prove nothing about what a real phone's browser does.
import type { Page } from "@playwright/test";

export type StandIn = {
  deviceId: string;
  label: string;
  facing?: "user" | "environment";
  /** The sides the camera's capabilities list, where its settings say none. */
  capable?: ("user" | "environment")[];
  width: number;
  height: number;
};
const upright = { width: 720, height: 1280 };
export const FRONT: StandIn = {
  deviceId: "front-id",
  label: "Front Camera",
  facing: "user",
  ...upright,
};
export const BACK: StandIn = {
  deviceId: "back-id",
  label: "Back Camera",
  facing: "environment",
  ...upright,
};
export const WIDE: StandIn = {
  deviceId: "wide-id",
  label: "Back Ultra Wide Camera",
  facing: "environment",
  ...upright,
};
export const PHONE = [FRONT, BACK, WIDE];
/** A camera that says nothing about which way it faces, by any route. */
export const UNSIDED: StandIn = {
  deviceId: "unsided-id",
  label: "Camera 2",
  ...upright,
};
/** A camera whose side is in its capabilities only. */
export const CAPABLE: StandIn = {
  deviceId: "capable-id",
  label: "Camera 3",
  capable: ["environment"],
  ...upright,
};

type Failure = { name: string; message?: string; afterMs?: number };
/** What a test can do to the stand-ins from inside the page. */
export type Bench = {
  calls: { video: unknown; outcome: string }[];
  tracks: MediaStreamTrack[];
  fail: Failure | null;
  hang: boolean;
  release(): void;
  unplug(deviceId: string, quietly?: boolean): void;
  plug(camera: StandIn): void;
  /** Turn every live camera a quarter turn, as a phone that is turned does. */
  turn(): void;
  setPermission(state: PermissionState): void;
};

/** Runs in the page before the app. Each picture has a RED block on its LEFT
 * edge, so a mirrored drawing is measurable: the red ends up on the right. */
function install(options: {
  cameras: StandIn[];
  permission: PermissionState;
  insecure: boolean;
}) {
  if (options.insecure) {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined });
    return;
  }
  // What a browser keeps between visits: the permission, and (for this
  // bench) which cameras were unplugged.
  const kept = (key: string, fallback: string) =>
      sessionStorage.getItem(`stand-in.${key}`) ?? fallback,
    keep = (key: string, value: string) =>
      sessionStorage.setItem(`stand-in.${key}`, value);
  const gone = new Set<string>(JSON.parse(kept("gone", "[]"))),
    cameras = () => options.cameras.filter((c) => !gone.has(c.deviceId)),
    media = navigator.mediaDevices,
    status = Object.assign(new EventTarget(), {
      state: kept("permission", options.permission) as PermissionState,
    });
  const setPermission = (state: PermissionState) => {
    if (status.state === state) return;
    status.state = state;
    keep("permission", state);
    status.dispatchEvent(new Event("change"));
  };
  const query = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = (d) =>
    (d.name as string) === "camera"
      ? Promise.resolve(status as unknown as PermissionStatus)
      : query(d);
  // Before permission a browser admits to one camera with no id or name.
  media.enumerateDevices = async () =>
    (status.state === "granted"
      ? cameras()
      : cameras()
          .slice(0, 1)
          .map(() => ({ deviceId: "", label: "" }))
    ).map(
      (c) =>
        ({ ...c, groupId: "", kind: "videoinput" as const }) as MediaDeviceInfo,
    );
  const live = new Map<MediaStreamTrack, string>(),
    turns: (() => void)[] = [];
  const bench: Bench = {
    calls: [],
    tracks: [],
    fail: null,
    hang: false,
    release() {},
    unplug(deviceId, quietly = false) {
      gone.add(deviceId);
      keep("gone", JSON.stringify([...gone]));
      for (const [track, id] of live)
        if (id === deviceId && track.readyState === "live") {
          track.stop();
          track.dispatchEvent(new Event("ended"));
        }
      if (!quietly) media.dispatchEvent(new Event("devicechange"));
    },
    plug(camera) {
      gone.delete(camera.deviceId);
      keep("gone", JSON.stringify([...gone]));
      if (!options.cameras.some((c) => c.deviceId === camera.deviceId))
        options.cameras.push(camera);
      media.dispatchEvent(new Event("devicechange"));
    },
    turn() {
      for (const turn of turns) turn();
    },
    setPermission,
  };
  Object.assign(window, { standIn: bench });
  media.getUserMedia = async (c) => {
    const call = {
      video: JSON.parse(JSON.stringify(c?.video ?? null)),
      outcome: "pending",
    };
    bench.calls.push(call);
    if (bench.hang) await new Promise<void>((r) => (bench.release = r));
    if (bench.fail) {
      const { name, message = "", afterMs = 0 } = bench.fail;
      await new Promise((r) => setTimeout(r, afterMs));
      call.outcome = name;
      throw new DOMException(message, name);
    }
    const video =
        c?.video === true ? {} : ((c?.video ?? {}) as MediaTrackConstraints),
      id = (video.deviceId as ConstrainDOMStringParameters | undefined)?.exact,
      side = (video.facingMode as ConstrainDOMStringParameters | undefined)
        ?.ideal,
      camera = id
        ? cameras().find((x) => x.deviceId === id)
        : (cameras().find((x) => x.facing === side) ?? cameras()[0]);
    if (!camera) {
      call.outcome = id ? "OverconstrainedError" : "NotFoundError";
      throw new DOMException("", call.outcome);
    }
    setPermission("granted");
    const canvas = document.createElement("canvas"),
      g = canvas.getContext("2d")!;
    canvas.width = camera.width;
    canvas.height = camera.height;
    const paint = () => {
      const { width: w, height: h } = canvas;
      g.fillStyle = camera.facing === "environment" ? "#2f855a" : "#2b6cb0";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ff0000";
      g.fillRect(0, 0, w * 0.2, h);
      // The clock keeps the picture changing, as a camera's does.
      g.fillStyle = "#ffffff";
      g.font = `${Math.round(w / 16)}px sans-serif`;
      g.fillText(`${camera.label} ${Date.now() % 100000}`, w * 0.25, h * 0.5);
    };
    paint();
    turns.push(() => {
      const { width, height } = canvas;
      canvas.width = height;
      canvas.height = width;
      paint();
    });
    const timer = setInterval(paint, 66),
      track = canvas.captureStream(15).getVideoTracks()[0],
      stop = track.stop.bind(track);
    track.stop = () => {
      clearInterval(timer);
      stop();
    };
    track.getSettings = () => ({
      deviceId: camera.deviceId,
      facingMode: camera.facing,
      width: canvas.width,
      height: canvas.height,
      frameRate: 15,
    });
    track.getCapabilities = () =>
      camera.capable ? { facingMode: camera.capable } : {};
    Object.defineProperty(track, "label", { value: camera.label });
    live.set(track, camera.deviceId);
    bench.tracks.push(track);
    call.outcome = camera.label;
    return new MediaStream([track]);
  };
}

/** Put stand-in cameras behind the page's camera API. Call before `goto`. */
export const standInCameras = (
  page: Page,
  cameras: StandIn[] = PHONE,
  extra: { permission?: PermissionState; insecure?: boolean } = {},
) =>
  page.addInitScript(install, {
    cameras,
    permission: extra.permission ?? "prompt",
    insecure: extra.insecure ?? false,
  });

/** Act on the stand-ins from a test, or read what was asked of them. */
export const bench = <T>(page: Page, act: (b: Bench) => T): Promise<T> =>
  page.evaluate(`(${act.toString()})(window.standIn)`) as Promise<T>;

/** Where the picture sits on the stage, in CSS pixels, and which side its red
 * edge is drawn on: "left" is as the camera sees it, "right" is mirrored. */
export const picture = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>(
        ".camera-stage canvas",
      )!,
      d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data,
      at = (x: number, y: number) => {
        const i = (y * c.width + x) * 4;
        return [d[i], d[i + 1], d[i + 2]];
      },
      // The stage's own colour, where no picture is drawn.
      bare = (p: number[]) =>
        Math.abs(p[0] - 16) < 6 &&
        Math.abs(p[1] - 25) < 6 &&
        Math.abs(p[2] - 28) < 6,
      red = (p: number[]) => p[0] > 200 && p[1] < 60 && p[2] < 60,
      row = Math.round(c.height * 0.3);
    let x0 = -1,
      x1 = -1,
      y0 = -1,
      y1 = -1;
    for (let x = 0; x < c.width; x++)
      if (!bare(at(x, row))) {
        if (x0 < 0) x0 = x;
        x1 = x;
      }
    const mid = Math.round((x0 + x1) / 2);
    for (let y = 0; y < c.height; y++)
      if (!bare(at(mid, y))) {
        if (y0 < 0) y0 = y;
        y1 = y;
      }
    const scale = c.width / c.getBoundingClientRect().width;
    return {
      width: Math.round((x1 - x0 + 1) / scale),
      height: Math.round((y1 - y0 + 1) / scale),
      red: red(at(x0 + 4, row))
        ? "left"
        : red(at(x1 - 4, row))
          ? "right"
          : "none",
    };
  });
