/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef } from "react";
import type { GameDef, GameState } from "../games";
import { tasksOf } from "../modes";
import type { ModeDef } from "../modes";
import { adoptFetched, registerServiceWorker } from "./register-sw";
import type { ShareResult } from "./share";

/** The score card: when a game stops, show the last score it reported. A
 * game that never scored leaves no card. */
export function useScoreShare(
  game: GameDef | null,
  gameState: GameState | null,
  show: (result: ShareResult) => void,
) {
  const last = useRef<{ id: string; state: GameState } | null>(null),
    latestShow = useRef(show);
  latestShow.current = show;
  useEffect(() => {
    if (game && gameState) last.current = { id: game.id, state: gameState };
  }, [game, gameState]);
  useEffect(() => {
    const ended = last.current;
    if (game || !ended) return;
    last.current = null;
    if (ended.state.score > 0)
      latestShow.current({ kind: "score", game: ended.id, ...ended.state });
  }, [game]);
}

/** Offline support. The service worker is registered once (production only),
 * and a model that loaded before the worker took control is handed to it when
 * its mode is ready, so every model is cached after its first real use and
 * never before. */
export function useOfflineCache(mode: ModeDef, status: string) {
  useEffect(registerServiceWorker, []);
  useEffect(() => {
    if (status !== "Ready") return;
    const base = new URL(import.meta.env.BASE_URL, location.href).href;
    adoptFetched(tasksOf(mode).map((task) => `${base}models/${task.model}`));
  }, [mode, status]);
}
