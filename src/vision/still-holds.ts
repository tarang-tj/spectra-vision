/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Who keeps the model running on a still picture (vision/still.ts). Both are
// read, never written, from here.
import { presenceStore } from "../panels/presence/presence-store";
import { telemetry } from "../telemetry/bus";
import { addInferenceHold } from "./still";

// The Lab's live charts, its stability meter and a benchmark all listen to
// the per-inference event for as long as they measure, and nothing else does.
addInferenceHold(() => (telemetry.listening("inference") ? "the Lab" : null));

// A Presence session measures over time and goes on while another tab shows.
// Its store has no hook for this yet, so its phase is read here; the cleaner
// home for this line is the store's own start and finish.
addInferenceHold(() => {
  const phase = presenceStore.getState().phase;
  return phase === "calibrating" || phase === "measuring"
    ? "a Presence session"
    : null;
});
