/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */

// Short floating labels ("+30", "MISS") that confirm each hit and miss where
// it happened. A fixed pool: nothing is allocated while a round runs.
import { write } from "./hud";

const LIFE_MS = 800;
type Popup = { age: number; text: string; x: number; y: number; color: string };

export function createPopups(size = 10) {
  const pool: Popup[] = Array.from({ length: size }, () => ({
    age: LIFE_MS,
    text: "",
    x: 0,
    y: 0,
    color: "",
  }));
  let next = 0;
  return {
    /** Show `text` at a canvas position (CSS pixels). */
    pop(text: string, x: number, y: number, color: string) {
      const popup = pool[next];
      next = (next + 1) % pool.length;
      popup.age = 0;
      popup.text = text;
      popup.x = x;
      popup.y = y;
      popup.color = color;
    },
    step(dt: number) {
      for (let i = 0; i < pool.length; i++)
        if (pool[i].age < LIFE_MS) pool[i].age += dt;
    },
    clear() {
      for (let i = 0; i < pool.length; i++) pool[i].age = LIFE_MS;
    },
    /** Labels rise and fade; under reduced motion they stay put and fade. */
    draw(ctx: CanvasRenderingContext2D, animate: boolean) {
      for (let i = 0; i < pool.length; i++) {
        const popup = pool[i];
        if (popup.age >= LIFE_MS) continue;
        const t = popup.age / LIFE_MS;
        ctx.globalAlpha = 1 - t * t;
        ctx.shadowColor = "#071016";
        ctx.shadowBlur = 6;
        write(
          ctx,
          popup.text,
          popup.x,
          popup.y - (animate ? 44 * t : 0),
          22,
          popup.color,
          700,
        );
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    },
  };
}
export type Popups = ReturnType<typeof createPopups>;
