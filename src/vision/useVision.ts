import { useEffect, useRef, useState } from "react";
import type { Mode, Source, VisionResult } from "./types";
export function useVision(
  mode: Mode,
  source: Source | null,
  paused: boolean,
  confidence: number,
) {
  const [result, setResult] = useState<VisionResult | null>(null),
    [status, setStatus] = useState("Loading model"),
    [error, setError] = useState("");
  const [restart, setRestart] = useState(0),
    workerRef = useRef<Worker | null>(null),
    settings = useRef({ source, paused, confidence });
  settings.current = { source, paused, confidence };
  useEffect(() => {
    setResult(null);
  }, [source?.generation, mode]);
  useEffect(() => {
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    const worker = new Worker(`${base}vision-worker.js`);
    workerRef.current = worker;
    let stopped = false,
      ready = false,
      busy = false,
      raf = 0,
      lastFrame = 0;
    setStatus("Loading model");
    setError("");
    setResult(null);
    const timeout = setTimeout(() => {
      if (!ready) {
        setError("Model load timed out. Check your connection and retry.");
        setStatus("Model unavailable");
      }
    }, 45000);
    worker.onmessage = (event) => {
      if (stopped) return;
      const message = event.data;
      if (message.type === "ready") {
        ready = true;
        clearTimeout(timeout);
        setStatus("Ready");
      } else if (message.type === "result") {
        busy = false;
        if (message.result.generation === settings.current.source?.generation)
          setResult(message.result);
      } else if (message.type === "error") {
        busy = false;
        ready = false;
        clearTimeout(timeout);
        setError(message.error);
        setStatus("Model unavailable");
      }
    };
    worker.onerror = () => {
      busy = false;
      ready = false;
      clearTimeout(timeout);
      setError(
        "Vision worker failed. Retry or use a current Chrome/Edge browser.",
      );
      setStatus("Model unavailable");
    };
    worker.postMessage({ type: "init", mode, base });
    const tick = async (time: number) => {
      if (stopped) return;
      raf = requestAnimationFrame(tick);
      const state = settings.current,
        element = state.source?.element;
      if (!ready || busy || state.paused || !element || time - lastFrame < 65)
        return;
      if (element instanceof HTMLVideoElement && element.readyState < 2) return;
      busy = true;
      lastFrame = time;
      const generation = state.source!.generation;
      try {
        const bitmap = await createImageBitmap(element);
        if (stopped || generation !== settings.current.source?.generation) {
          bitmap.close();
          busy = false;
          return;
        }
        worker.postMessage(
          {
            type: "frame",
            bitmap,
            time: performance.now(),
            generation,
            confidence: state.confidence,
          },
          [bitmap],
        );
      } catch {
        busy = false;
        if (!stopped)
          setError(
            "Could not read this frame. Try another image, video or camera.",
          );
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
  }, [mode, restart]);
  return { result, status, error, retry: () => setRestart((n) => n + 1) };
}
