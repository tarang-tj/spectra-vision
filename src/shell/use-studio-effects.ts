/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect } from "react";
import { telemetry } from "../telemetry/bus";
import { adoptFetched, registerServiceWorker } from "./register-sw";

/** Offline support. The service worker is registered once (production only).
 * Each time a model finishes loading, the files its worker fetched (the
 * MediaPipe runtime, its wasm and the model) are handed to the service
 * worker: on a first visit they were fetched before it took control. So every
 * model is kept after its first real use and never before. */
export function useOfflineCache() {
  useEffect(registerServiceWorker, []);
  useEffect(
    () =>
      telemetry.on("model", (event) => {
        if (event.files) adoptFetched(event.files);
      }),
    [],
  );
}
