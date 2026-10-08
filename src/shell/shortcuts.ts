/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

/** What a key press asks the shell to do. `mode` carries a zero-based index
 * into the mode registry, so the map works for however many modes exist. */
export type ShortcutAction =
  | { type: "mode"; index: number }
  | { type: "record" }
  | { type: "screenshot" }
  | { type: "mirror" }
  | { type: "effects" }
  | { type: "help" }
  | { type: "palette" }
  | { type: "escape" };

/** The fields of a KeyboardEvent the matcher reads (plain data, so it can be
 * unit-tested without a DOM). */
export type KeyPress = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
};

/** Most modes a number key can reach. */
export const MAX_MODE_KEYS = 7;

/** The table shown in the help section. Keep it in step with matchShortcut. */
export const SHORTCUTS: readonly { keys: string; does: string }[] = [
  { keys: "1 to 7", does: "Switch vision mode" },
  { keys: "R", does: "Start or stop recording" },
  { keys: "S", does: "Save a screenshot" },
  { keys: "M", does: "Mirror the view" },
  { keys: "E", does: "Open or close the effects tray" },
  { keys: "?", does: "Open or close this help" },
  { keys: "Ctrl K or ⌘ K", does: "Open the command palette" },
  { keys: "Esc", does: "Close the palette or leave the immersive view" },
];

const LETTERS: Record<string, ShortcutAction> = {
  r: { type: "record" },
  s: { type: "screenshot" },
  m: { type: "mirror" },
  e: { type: "effects" },
};

/** Map one key press to an action, or null when it is not a shortcut.
 * `modeCount` is the number of registered modes: a digit past it does nothing. */
export function matchShortcut(
  press: KeyPress,
  modeCount: number,
): ShortcutAction | null {
  if (press.repeat) return null;
  const key = press.key.toLowerCase();
  if ((press.ctrlKey || press.metaKey) && !press.altKey)
    return key === "k" ? { type: "palette" } : null;
  // Any other modified press belongs to the browser or the OS.
  if (press.ctrlKey || press.metaKey || press.altKey) return null;
  if (key === "escape") return { type: "escape" };
  if (key === "?") return { type: "help" };
  if (/^[1-9]$/.test(key)) {
    const index = Number(key) - 1;
    return index < Math.min(modeCount, MAX_MODE_KEYS)
      ? { type: "mode", index }
      : null;
  }
  return LETTERS[key] ?? null;
}

/** The part of an element the typing check reads. */
export type FocusTarget = {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
};

// Inputs of these types take no text, so single keys stay shortcuts on them.
const NON_TEXT_INPUTS = new Set(["range", "checkbox", "radio", "button"]);

/** True when the focused element consumes typed characters, in which case a
 * single-key shortcut must not fire. */
export function isTypingTarget(target: FocusTarget | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = (target.tagName ?? "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag === "input")
    return !NON_TEXT_INPUTS.has((target.type ?? "text").toLowerCase());
  return false;
}
