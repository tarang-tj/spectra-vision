/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { modes } from "../modes";
import type { ModeDef } from "../modes";
import { modeColumns } from "../shell/layout";
import { MAX_MODE_KEYS } from "../shell/shortcuts";

/** One button per registered mode. On a wide screen it is a single centred
 * segment; on a narrow one it becomes a grid of up to four columns so seven
 * modes stay readable. Each button's number key is in its tooltip. */
export default function ModeSwitch({
  mode,
  onMode,
}: {
  mode: ModeDef;
  onMode: (id: string) => void;
}) {
  return (
    <nav
      className="modes"
      aria-label="Vision mode"
      data-coach="modes"
      style={
        { "--mode-cols": modeColumns(modes.length) } as React.CSSProperties
      }
    >
      {modes.map((m, i) => (
        <button
          key={m.id}
          aria-pressed={m.id === mode.id}
          aria-keyshortcuts={i < MAX_MODE_KEYS ? String(i + 1) : undefined}
          title={i < MAX_MODE_KEYS ? `${m.label} (${i + 1})` : m.label}
          onClick={() => onMode(m.id)}
        >
          {m.short}
        </button>
      ))}
    </nav>
  );
}
