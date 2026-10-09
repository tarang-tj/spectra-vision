/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { telemetry } from "../telemetry/bus";
import type { VisionResult } from "./types";

/** Every merged result of the running mode, as it arrives, whichever panel is
 * mounted. This is the one feed a measuring panel should use: a panel that is
 * not on show is unmounted, so reading `useStudio().frame` would miss frames.
 *
 * - `result` is the raw model output: never smoothed, never edited. It is the
 *   same object the stage and the session export receive; do not mutate it.
 * - `generation` is the source generation the result belongs to
 *   (`result.generation`); a new source or mode means a new generation.
 * - Nothing arrives while the stage is paused or the tab is hidden, because no
 *   frames are sent to the models then.
 * Returns the unsubscribe function. The bus catches a listener that throws. */
export function onVisionResult(
  listener: (result: VisionResult, generation: number) => void,
): () => void {
  return telemetry.on("result", (e) => listener(e.result, e.generation));
}
