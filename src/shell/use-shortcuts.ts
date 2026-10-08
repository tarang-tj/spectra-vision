/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef } from "react";
import { isTypingTarget, matchShortcut } from "./shortcuts";
import type { ShortcutAction } from "./shortcuts";

/** Listens for the global shortcuts while mounted. One listener is attached
 * for the life of the component and removed on unmount; the handler is read
 * through a ref so that a re-render never re-attaches it.
 *
 * `blocked` is true while a modal dialog owns the keyboard: then only its own
 * handlers run, apart from Ctrl/Cmd K, which the dialog also understands. */
export function useShortcuts(
  modeCount: number,
  blocked: boolean,
  run: (action: ShortcutAction) => void,
) {
  const latest = useRef({ modeCount, blocked, run });
  latest.current = { modeCount, blocked, run };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const { modeCount, blocked, run } = latest.current;
      if (event.defaultPrevented || event.isComposing) return;
      const action = matchShortcut(event, modeCount);
      if (!action) return;
      const typing = isTypingTarget(event.target as HTMLElement | null);
      if (action.type === "palette") {
        // Ctrl/Cmd K would otherwise focus the browser's address bar.
        event.preventDefault();
        run(action);
        return;
      }
      if (blocked) return;
      // Escape in a field keeps its native meaning (clear, close a picker).
      if (typing) return;
      if (action.type !== "escape") event.preventDefault();
      run(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
