/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which camera to ask for: the last one used (remembered on this device and
// never sent anywhere), what the person picked, and what a panel prefers.
import { readFlag, writeFlag } from "../shell/storage";
import type { CameraWant, Facing, Granted } from "./camera-start";

const KEY = "spectra.camera.v1";

const isFacing = (value: unknown): value is Facing =>
  value === "user" || value === "environment";

/** Read a stored choice. Anything that is not one comes back as null. */
export function parseChoice(text: string | null): CameraWant | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Record<string, unknown> | null;
    if (!value || typeof value !== "object") return null;
    const want: CameraWant = {};
    if (typeof value.deviceId === "string" && value.deviceId)
      want.deviceId = value.deviceId;
    if (isFacing(value.facing)) want.facing = value.facing;
    return want.deviceId || want.facing ? want : null;
  } catch {
    return null;
  }
}

/** The text to store for a camera that just started. The side is kept beside
 * the id because some browsers hand out new ids on every visit. */
export function choiceText(
  granted: Pick<Granted, "deviceId" | "facing">,
): string {
  return JSON.stringify({
    ...(granted.deviceId ? { deviceId: granted.deviceId } : {}),
    ...(isFacing(granted.facing) ? { facing: granted.facing } : {}),
  });
}

// Read from storage once: the chooser asks on every render.
let stored: CameraWant | null | undefined;
export const readChoice = (): CameraWant | null =>
  (stored ??= parseChoice(readFlag(KEY)));
export function writeChoice(granted: Granted): void {
  const text = choiceText(granted);
  stored = parseChoice(text);
  writeFlag(KEY, text);
}

/** What Start camera asks for. A side picked by hand wins; then the side the
 * open panel prefers; then the remembered camera. The remembered id is not
 * used when it is known to be on the other side. */
export function startWant(
  picked: CameraWant | null,
  preferred: Facing | null,
  remembered: CameraWant | null,
): CameraWant {
  if (picked?.deviceId) return picked;
  const facing = picked?.facing ?? preferred ?? remembered?.facing;
  // A remembered camera that never said which way it faces (a desk webcam)
  // gives way to a side picked by hand, but not to a panel's preference.
  const clash =
    facing &&
    (remembered?.facing ? remembered.facing !== facing : !!picked?.facing);
  if (!remembered?.deviceId || clash) return facing ? { facing } : {};
  return {
    deviceId: remembered.deviceId,
    remembered: true,
    ...(facing ? { facing } : {}),
    ...(remembered.facing ? {} : { sideUnknown: true as const }),
  };
}

/** What the Flip tool asks for. A camera that says which way it faces flips
 * to the other side; one that does not (two webcams on a desk) moves to the
 * next camera in the list. Null when there is nothing to flip to. */
export function flipWant(
  live: Pick<Granted, "deviceId" | "facing">,
  ids: string[],
): CameraWant | null {
  const previousId = live.deviceId || undefined;
  if (live.facing !== "unknown")
    return {
      facing: live.facing === "user" ? "environment" : "user",
      previousId,
    };
  const known = ids.filter(Boolean);
  if (known.length < 2) return null;
  const next = known[(known.indexOf(live.deviceId) + 1) % known.length];
  return next === live.deviceId ? null : { deviceId: next, previousId };
}

/** Whether Front and Rear mean anything here: on a touch device (a phone or
 * a tablet), or when one of several cameras says which way it faces. A
 * laptop with one webcam gets no such choice. */
export function hasSides(
  touch: boolean,
  count: number,
  facings: Granted["facing"][],
): boolean {
  return touch || (count > 1 && facings.some((f) => f !== "unknown"));
}

// The side a panel would like Start camera to ask for, by owner. A panel that
// measures a room wants the rear camera; it says so while it is on show.
const preferences = new Map<string, Facing>(),
  listeners = new Set<() => void>();
const changed = () => listeners.forEach((listener) => listener());

/** Ask for a side while the caller is on show; call the returned function to
 * withdraw it. One line in a panel: `useEffect(() => preferCamera("ruler",
 * "environment"), [])`. A side the person picks by hand still wins. */
export function preferCamera(owner: string, facing: Facing): () => void {
  preferences.set(owner, facing);
  changed();
  return () => {
    if (preferences.get(owner) === facing) preferences.delete(owner);
    changed();
  };
}

/** The most recent preference still standing, or null. */
export const preferredFacing = (): Facing | null =>
  [...preferences.values()].at(-1) ?? null;

export function subscribePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
