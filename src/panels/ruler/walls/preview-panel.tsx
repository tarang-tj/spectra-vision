/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Mesh } from "./mesh";
import { drawPreview, START, TURN, turned } from "./preview";

const W = 480,
  H = 360;
const KEYS: Record<string, [number, number]> = {
  ArrowLeft: [-TURN, 0],
  ArrowRight: [TURN, 0],
  ArrowUp: [0, TURN / 2],
  ArrowDown: [0, -TURN / 2],
};

/** The shell in 3D. Drag it or use the arrow keys to turn it. It is drawn
 * again only when it is turned or the shell changes; the list named by
 * `describedBy` says the same in words. */
export default function PreviewPanel({
  mesh,
  describedBy,
  note,
}: {
  mesh: Mesh;
  describedBy: string;
  /** Why only the floor is drawn, when that is so. Written on the drawing
   * and under it. */
  note: string | null;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    last = useRef<{ id: number; x: number; y: number } | null>(null),
    [view, setView] = useState(START);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (ctx) drawPreview(ctx, mesh, view, W, H, note);
  }, [mesh, view, note]);

  function key(e: KeyboardEvent) {
    const d = KEYS[e.key];
    if (!d) return;
    e.preventDefault();
    setView((v) => turned(v, d[0], d[1]));
  }

  return (
    <>
      <canvas
        ref={canvas}
        className="walls-preview"
        width={W}
        height={H}
        tabIndex={0}
        role="img"
        data-testid="walls-preview"
        data-yaw={view.yaw.toFixed(3)}
        aria-label={`3D view of the room ${note ? "floor" : "shell"}. Drag it, or press the arrow keys, to turn it.`}
        aria-describedby={describedBy}
        onKeyDown={key}
        onPointerDown={(e) => {
          last.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const from = last.current;
          if (!from || from.id !== e.pointerId) return;
          const dx = e.clientX - from.x,
            dy = e.clientY - from.y;
          last.current = { id: from.id, x: e.clientX, y: e.clientY };
          setView((v) => turned(v, dx * 0.01, dy * 0.01));
        }}
        onPointerUp={() => (last.current = null)}
        onPointerCancel={() => (last.current = null)}
      />
      <p className="ruler-basis">
        {note ??
          "The shell from your taps, seen from outside. Walls carry their numbers."}{" "}
        Drag to turn it, or focus it and press the arrow keys.
      </p>
    </>
  );
}
