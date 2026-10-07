import { useState } from "react";
import { panels } from "../panels";
import { useStudio } from "../studio-context";
import "../styles/panel-tabs.css";

/** The right-hand rail. It shows the registered panels as tabs; with a single
 * panel there is no tab bar and the rail looks exactly as it did in v1. */
export default function Inspector() {
  const studio = useStudio(),
    visible = panels.filter((panel) => panel.visible?.(studio) ?? true),
    [chosen, setChosen] = useState<string | null>(null),
    current = visible.find((panel) => panel.id === chosen) ?? visible[0];
  return (
    <aside className="inspector">
      {visible.length > 1 && (
        <nav className="panel-tabs" aria-label="Inspector panel">
          {visible.map((panel) => (
            <button
              key={panel.id}
              aria-pressed={panel.id === current.id}
              onClick={() => setChosen(panel.id)}
            >
              {panel.label}
            </button>
          ))}
        </nav>
      )}
      {current && <current.Component />}
    </aside>
  );
}
