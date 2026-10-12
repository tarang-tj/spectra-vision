/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { panels } from "../panels";
import { useStudio } from "../studio-context";
import ErrorBoundary from "./ErrorBoundary";
import "../styles/panel-tabs.css";

/** The right-hand rail. It shows the registered panels as tabs; with a single
 * panel there is no tab bar. The rail is as tall as the stage and the chosen
 * panel scrolls inside it, so a long panel never stretches the stage. A panel
 * that throws while rendering shows a message in its own place and takes
 * nothing else down. */
export default function Inspector() {
  const studio = useStudio(),
    visible = panels.filter((panel) => panel.visible?.(studio) ?? true),
    current = visible.find((panel) => panel.id === studio.panel) ?? visible[0];
  return (
    <aside className="inspector">
      {visible.length > 1 && (
        <nav className="panel-tabs" aria-label="Inspector panel">
          {visible.map((panel) => (
            <button
              key={panel.id}
              aria-pressed={panel.id === current.id}
              onClick={() => studio.openPanel(panel.id)}
            >
              {panel.label}
            </button>
          ))}
        </nav>
      )}
      <div className="panel-body" data-panel={current?.id}>
        {current && (
          <ErrorBoundary key={current.id} name={`The ${current.label} panel`}>
            <current.Component />
          </ErrorBoundary>
        )}
      </div>
    </aside>
  );
}
