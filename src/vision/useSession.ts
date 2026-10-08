/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import type { ModeDef } from "../modes";
import { Tracker } from "./tracker";
import type { Source, Track, VisionResult } from "./types";

const NO_TRACKS: Track[] = [];
/** The latest processed frames kept for the session export. */
const HISTORY_LIMIT = 1000;

/** What one mode on one source has produced so far: object tracks, the
 * measured result rate and the frames for the session export. All of it
 * starts over when the mode or the source changes. */
export function useSession(
  mode: ModeDef,
  source: Source | null,
  result: VisionResult | null,
) {
  // Tracks and rate are stored with the session they were measured in. They
  // are cleared in an effect, one render after a mode or source change, so the
  // key keeps that render from showing the previous session's values.
  const key = `${mode.id}:${source?.generation ?? "none"}`,
    [live, setLive] = useState<{
      key: string;
      tracks: Track[];
      fps: number | null;
    }>({ key, tracks: NO_TRACKS, fps: null });
  const tracker = useRef(new Tracker()),
    history = useRef<unknown[]>([]),
    previous = useRef<number | null>(null);
  useEffect(() => {
    tracker.current.reset();
    previous.current = null;
    history.current = [];
    setLive({ key, tracks: NO_TRACKS, fps: null });
  }, [key]);
  useEffect(() => {
    const r = result;
    if (!r) return;
    let instant: number | null = null;
    if (previous.current !== null) {
      // In a multi-task mode a secondary task reports under the primary
      // frame's time: that is not a new frame, so nothing is counted twice.
      if (r.time <= previous.current) return;
      instant = 1000 / (r.time - previous.current);
    }
    previous.current = r.time;
    // Only a mode whose detections are separate objects gets track ids.
    const tracks = mode.tracked
      ? tracker.current.update(r.detections, r.time)
      : NO_TRACKS;
    setLive((old) => ({
      key,
      tracks,
      fps:
        instant === null || old.fps === null
          ? (instant ?? old.fps)
          : old.fps * 0.8 + instant * 0.2,
    }));
    // The v1 keys of an entry are fixed. A mode may add optional keys of its
    // own but can never replace one of these.
    const entry: Record<string, unknown> = {
      elapsedMs: Math.round(r.time),
      latencyMs: r.latency,
      detections: r.detections,
      landmarks: r.landmarks,
      handedness: r.handedness,
    };
    const extra = mode.exportFrame?.(r);
    if (extra)
      for (const name of Object.keys(extra))
        if (!(name in entry)) entry[name] = extra[name];
    history.current.push(entry);
    if (history.current.length > HISTORY_LIMIT) history.current.shift();
    // `result` already belongs to this mode and source (see useVision), so
    // it is the only input that says a new frame was processed.
  }, [result]);
  const current = live.key === key;
  return {
    tracks: current ? live.tracks : NO_TRACKS,
    fps: current ? live.fps : null,
    history,
  };
}
