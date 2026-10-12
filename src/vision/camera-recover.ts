/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { afterPermissionChange } from "./camera-errors";
import type { Permission } from "./camera-errors";
import type { SourceCore } from "./camera-source";
import type { CameraWant } from "./camera-start";

/** What brings a camera back without the person asking twice: a tab that is
 * on show again, a permission granted while the error card was up, and a
 * camera plugged in after "No camera found". */
export function useCameraRecovery(
  devices: { permission: Permission; count: number },
  open: (want: CameraWant) => Promise<void>,
  wanted: RefObject<CameraWant>,
  /** True when the live camera ended while the tab was hidden. */
  lostHidden: RefObject<boolean>,
  now: RefObject<{ core: SourceCore }>,
  wake: () => void,
) {
  // Back on show: reopen a camera the system took while the tab was hidden,
  // and nudge a video the browser paused.
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== "visible") return;
      if (lostHidden.current) void open(wanted.current);
      else wake();
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, [open, wanted, lostHidden, wake]);
  // The error card clears itself: a permission that was granted meanwhile, or
  // a camera that was plugged in, starts the camera that was asked for.
  const seen = useRef({ permission: devices.permission, count: devices.count });
  useEffect(() => {
    const was = seen.current,
      { problem, setProblem } = now.current.core;
    seen.current = { permission: devices.permission, count: devices.count };
    if (problem?.from !== "camera") return;
    const { code } = problem.failure,
      refused = code === "blocked" || code === "dismissed",
      allowed =
        devices.permission === "granted" && was.permission !== "granted",
      arrived = devices.count > 0 && was.count === 0;
    if ((refused && allowed) || (code === "none" && arrived))
      return void open(wanted.current);
    const next = afterPermissionChange(code, devices.permission);
    if (next !== code && was.permission !== devices.permission)
      setProblem({
        from: "camera",
        failure: { ...problem.failure, code: next },
      });
  }, [devices.permission, devices.count, open, wanted, now]);
}
