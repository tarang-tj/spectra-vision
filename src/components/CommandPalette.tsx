/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { filterCommands } from "../shell/commands";
import type { Command } from "../shell/commands";
import "../styles/palette.css";

/** A modal list of everything the studio can do, filtered as you type.
 * Focus stays on the text field while it is open (the list is driven with the
 * arrow keys) and returns to wherever it was when the palette closes. */
export default function CommandPalette({
  commands,
  onClose,
}: {
  commands: readonly Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState(""),
    [active, setActive] = useState(0),
    input = useRef<HTMLInputElement>(null),
    list = useRef<HTMLUListElement>(null),
    matches = useMemo(() => filterCommands(commands, query), [commands, query]),
    index = Math.min(active, Math.max(0, matches.length - 1));
  // Read once, at first render: under StrictMode an effect runs twice, and
  // the second time the focused element would already be the field itself.
  const [opener] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    input.current?.focus();
    return () => {
      // Give focus back, unless the command that just ran moved it itself.
      const now = document.activeElement;
      if ((!now || now === document.body) && opener?.isConnected)
        opener.focus();
    };
  }, [opener]);
  useEffect(() => {
    list.current
      ?.querySelector('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [index, query]);
  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    try {
      command.run();
    } catch (error) {
      console.error(`[spectra palette] ${command.id} failed:`, error);
    }
  };
  const onKey = (event: React.KeyboardEvent) => {
    const last = matches.length - 1;
    if (event.key === "Escape") onClose();
    else if (event.key === "Enter") run(matches[index]);
    else if (event.key === "ArrowDown")
      setActive(index >= last ? 0 : index + 1);
    else if (event.key === "ArrowUp") setActive(index <= 0 ? last : index - 1);
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(last);
    // Tab stays inside the dialog: the field is its only focusable element.
    else if (event.key !== "Tab") return;
    event.preventDefault();
  };
  return (
    <div
      className="palette-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKey}
      >
        <label className="palette-field">
          <Search size={18} />
          <input
            ref={input}
            type="text"
            role="combobox"
            aria-label="Search commands"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={
              matches[index] ? `palette-${matches[index].id}` : undefined
            }
            aria-autocomplete="list"
            placeholder="Search modes, effects and actions"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <ul id="palette-list" role="listbox" aria-label="Commands" ref={list}>
          {matches.map((command, i) => (
            <li
              key={command.id}
              id={`palette-${command.id}`}
              role="option"
              aria-selected={i === index}
              onMouseMove={() => setActive(i)}
              onClick={() => run(command)}
            >
              <small>{command.group}</small>
              <span>{command.label}</span>
              {command.hint && <kbd>{command.hint}</kbd>}
            </li>
          ))}
          {!matches.length && (
            <li className="palette-empty" role="presentation">
              Nothing matches “{query}”.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
