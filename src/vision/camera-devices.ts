/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useCallback, useEffect, useState } from "react";
import type { Permission } from "./camera-errors";

export type CameraOption = { deviceId: string; label: string };
/** `count` is every camera the browser admits to; `named` is the ones that
 * can be asked for by id. Before permission a browser lists cameras with no
 * id and no name, so `named` is empty while `count` is not. */
export type CameraList = { count: number; named: CameraOption[] };

const EMPTY: CameraList = { count: 0, named: [] };

export function cameraList(
  devices: Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">[],
): CameraList {
  const cameras = devices.filter((d) => d.kind === "videoinput");
  return {
    count: cameras.length,
    named: cameras
      .map((c, i) => ({
        deviceId: c.deviceId,
        label: c.label || `Camera ${i + 1}`,
      }))
      .filter((c) => c.deviceId),
  };
}

const same = (a: CameraList, b: CameraList) =>
  a.count === b.count &&
  a.named.length === b.named.length &&
  a.named.every(
    (c, i) =>
      c.deviceId === b.named[i].deviceId && c.label === b.named[i].label,
  );

/** The camera permission as the browser reports it right now. */
export async function cameraPermission(): Promise<Permission> {
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state;
  } catch {
    // No Permissions API, or one that does not know "camera".
    return "unknown";
  }
}

/** The cameras on this device and the camera permission, kept true: the list
 * is read again whenever the browser says a device came or went, and the
 * permission follows the browser's own change event. */
export function useCameraDevices() {
  const [list, setList] = useState<CameraList>(EMPTY),
    [permission, setPermission] = useState<Permission>("unknown");
  const refresh = useCallback(async () => {
    try {
      const next = cameraList(await navigator.mediaDevices.enumerateDevices());
      // The same list again must not redraw the page.
      setList((was) => (same(was, next) ? was : next));
    } catch {
      /* A camera can work even when the list cannot be read. */
    }
  }, []);
  useEffect(() => {
    // Not a secure page, or a browser without cameras: nothing to watch.
    const media = navigator.mediaDevices as MediaDevices | undefined;
    let alive = true,
      status: PermissionStatus | null = null;
    const listed = () => void refresh(),
      changed = () => {
        if (status) setPermission(status.state);
        // Names and ids appear once the permission is granted.
        void refresh();
      };
    void refresh();
    media?.addEventListener?.("devicechange", listed);
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((s) => {
        if (!alive) return;
        status = s;
        setPermission(s.state);
        s.addEventListener("change", changed);
      })
      .catch(() => {
        /* Firefox does not know the name "camera": stay "unknown". */
      });
    return () => {
      alive = false;
      media?.removeEventListener?.("devicechange", listed);
      status?.removeEventListener("change", changed);
    };
  }, [refresh]);
  return { ...list, permission, refresh };
}
