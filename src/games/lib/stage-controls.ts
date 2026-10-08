/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// The two controls a game needs beyond the body: Play again and Mute. They
// are drawn on the canvas by the HUD; this module lays an invisible real
// button over each one so it has a name, keyboard focus and a click.
import "./stage-controls.css";

export type ControlName = "again" | "mute";
export type StageControls = {
  /** Put a button over a rectangle given in canvas CSS pixels, or hide it. */
  place(
    name: ControlName,
    visible: boolean,
    x?: number,
    y?: number,
    w?: number,
    h?: number,
  ): void;
  /** Reflect the mute state in the button's name and pressed state. */
  muted(value: boolean): void;
  dispose(): void;
};

export function createStageControls(
  canvas: HTMLCanvasElement,
  actions: Record<ControlName, () => void>,
): StageControls {
  const host = canvas.parentElement,
    layer = document.createElement("div"),
    buttons = {} as Record<ControlName, HTMLButtonElement>,
    // Last geometry written per button (x, y, w, h; -1 when hidden), so the
    // styles are touched only when a button actually moves.
    last: Record<ControlName, number[]> = {
      again: [-1, 0, 0, 0],
      mute: [-1, 0, 0, 0],
    };
  layer.className = "game-controls";
  for (const name of ["mute", "again"] as const) {
    const button = document.createElement("button");
    button.type = "button";
    button.hidden = true;
    button.dataset.gameControl = name;
    button.addEventListener("click", actions[name]);
    buttons[name] = button;
    layer.append(button);
  }
  buttons.again.setAttribute("aria-label", "Play again");
  host?.append(layer);
  const controls: StageControls = {
    place(name, visible, x = 0, y = 0, w = 0, h = 0) {
      const was = last[name],
        nx = visible ? Math.round(x) : -1,
        ny = Math.round(y),
        nw = Math.round(w),
        nh = Math.round(h);
      if (
        nx === was[0] &&
        (!visible || (ny === was[1] && nw === was[2] && nh === was[3]))
      )
        return;
      was[0] = nx;
      was[1] = ny;
      was[2] = nw;
      was[3] = nh;
      const button = buttons[name];
      button.hidden = !visible;
      if (!visible) return;
      button.style.left = `${nx}px`;
      button.style.top = `${ny}px`;
      button.style.width = `${nw}px`;
      button.style.height = `${nh}px`;
    },
    muted(value) {
      const button = buttons.mute;
      if (button.getAttribute("aria-pressed") === String(value)) return;
      button.setAttribute("aria-pressed", String(value));
      button.setAttribute(
        "aria-label",
        value ? "Unmute game sound" : "Mute game sound",
      );
    },
    dispose() {
      for (const name of ["mute", "again"] as const)
        buttons[name].removeEventListener("click", actions[name]);
      layer.remove();
    },
  };
  return controls;
}
