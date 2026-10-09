/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { stageHooks } from "./stage/stage-hooks";
import { onVisionResult } from "./vision/result-feed";

/** True only when the page was opened with `?spectra-test`. The two hooks the
 * browser tests read or set (GL object counters, a shortened benchmark) exist
 * only then, so a normal visit to the public site has no test globals. */
export function testHooksEnabled(): boolean {
  try {
    return new URLSearchParams(location.search).has("spectra-test");
  } catch {
    return false;
  }
}

/** What a browser test may read about the running stage, only on a page opened
 * with `?spectra-test`:
 *   window.__spectraResults  count of merged results, and a summary of the last
 *                            (per task: model, delegate, landmark and world counts)
 *   window.__spectraStage    the stage hooks (addOverlay, onPointer)
 * Both are read-only views of what panels already get; nothing is sent anywhere. */
export function exposeTestProbes(): void {
  if (typeof window === "undefined" || !testHooksEnabled()) return;
  const probe: { count: number; last: unknown } = { count: 0, last: null };
  onVisionResult((result) => {
    probe.count++;
    probe.last = {
      mode: result.mode,
      generation: result.generation,
      tasks: Object.fromEntries(
        Object.entries(result.tasks).map(([kind, task]) => [
          kind,
          {
            model: task.model ?? null,
            delegate: task.delegate,
            landmarks: task.landmarks.map((list) => list.length),
            world: Array.isArray(task.extra?.world)
              ? task.extra.world.map((list: unknown[]) => list.length)
              : null,
          },
        ]),
      ),
    };
  });
  Object.assign(window, {
    __spectraResults: probe,
    __spectraStage: stageHooks,
  });
}
