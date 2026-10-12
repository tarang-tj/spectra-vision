/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { cameraCard } from "../vision/camera-errors";
import type { Platform } from "../vision/camera-errors";
import type { SourceProblem } from "../vision/useSource";

/** The stage's error card: what happened, what to do, and which ways forward
 * to offer. `retry` is the retry button's words, or null when trying again
 * cannot help; `demo` is false when the retry already is the demo. */
export type StageCard = {
  title: string;
  text: string;
  fix: string;
  retry: string | null;
  demo: boolean;
  /** The camera icon is for camera trouble only, not for a missing model. */
  camera: boolean;
};

/** The card for a source that failed, else for a model that failed, else
 * null. Each kind of failure retries its own thing: a demo that did not load
 * never offers to start the camera. */
export function stageCard(
  problem: SourceProblem | null,
  modelError: string,
  platform: Platform,
): StageCard | null {
  if (problem?.from === "camera")
    return {
      ...cameraCard(problem.failure, platform),
      demo: true,
      camera: true,
    };
  if (problem?.from === "demo")
    return {
      title: "The demo did not load.",
      text: problem.text,
      fix: "",
      retry: "Retry demo",
      demo: false,
      camera: false,
    };
  if (problem)
    return {
      title: "That file did not open.",
      text: problem.text,
      fix: "",
      retry: null,
      demo: true,
      camera: false,
    };
  if (!modelError) return null;
  return {
    // The start of OFFLINE_MESSAGE (src/vision/download-failure.ts).
    title: modelError.startsWith("This device is offline")
      ? "You are offline."
      : "Let’s get you seeing.",
    text: modelError,
    fix: "",
    retry: "Retry model",
    demo: true,
    camera: /camera/i.test(modelError),
  };
}
