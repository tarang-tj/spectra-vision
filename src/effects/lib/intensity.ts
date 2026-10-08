/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** Per-effect intensity, 0..1. An effect that declares `intensity` in its
 * EffectDef reads its value here every frame; a slider writes it with
 * setEffectIntensity. Values live for the page session and never leave it. */
const values = new Map<string, number>(),
  listeners = new Set<() => void>();

export const clampIntensity = (value: number) =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

/** The current value, or `fallback` (the effect's default) if never set. */
export const effectIntensity = (id: string, fallback: number): number =>
  values.get(id) ?? clampIntensity(fallback);

export function setEffectIntensity(id: string, value: number) {
  const next = clampIntensity(value);
  if (values.get(id) === next) return;
  values.set(id, next);
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch (error) {
      console.warn("[spectra effect] intensity listener failed:", error);
    }
  }
}

/** Hear about every change (for a slider to re-render). Returns unsubscribe. */
export function onEffectIntensity(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
