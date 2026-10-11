/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Random states of one picture, for the tests that carry a view through a
// switch or through a room file and expect every field back.
import { seededRandom } from "../../src/panels/ruler/monte-carlo";
import type { ViewSnap } from "../../src/panels/ruler/room/views-store";

/** A generator of view snapshots for pictures `w` by `h` pixels. Every field
 * the Ruler, its known sizes, Box and Walls hold is varied. */
export function randomSnaps(seed: number, w: number, h: number) {
  const r = seededRandom(seed),
    int = (n: number) => Math.floor(r() * n),
    pt = () => ({ x: r() * w, y: r() * h, s: 0.5 + r() * 3 }),
    pts = (n: number) => Array.from({ length: n }, pt);
  const snap = (): ViewSnap => ({
    ruler: {
      refId: ["letter", "a4", "card", "custom"][int(4)],
      customA: String(100 + int(900)),
      customB: String(100 + int(900)),
      corners: pts(int(5)),
      swap: r() < 0.5,
      measures: Array.from({ length: int(4) }, () => ({
        a: pt(),
        b: r() < 0.8 ? pt() : null,
        ...(r() < 0.5
          ? {
              tape: String(int(900)),
              tapeUnit: "cm" as const,
              known: r() < 0.5,
            }
          : {}),
      })),
      shapes: Array.from({ length: int(3) }, () => ({
        kind: (["path", "area", "edge"] as const)[int(3)],
        pts: pts(3 + int(4)),
        done: r() < 0.8,
      })),
      lensOn: r() < 0.5,
      source: { w, h },
      scale: 0.25 + r(),
    },
    known: {
      extraRefs: Array.from({ length: int(3) }, () => ({
        label: "A4",
        long: 297,
        short: 210,
        corners: pts(int(5)),
      })),
      tapeSd: String(1 + int(9)),
    },
    box: {
      w: 100 + int(3000),
      d: 100 + int(3000),
      h: 100 + int(3000),
      at: r() < 0.7 ? { x: r() * 4000, y: r() * 3000 } : null,
      rot: r() * 360 - 180,
    },
    walls: (() => {
      const corners = Array.from({ length: int(6) }, () => ({
          base: pt(),
          top: r() < 0.5 ? pt() : null,
        })),
        closed = corners.length >= 3 && r() < 0.7;
      return {
        corners: closed ? corners : corners.map((c) => ({ ...c, top: null })),
        closed,
        pick: closed && r() < 0.5 ? int(corners.length) : null,
      };
    })(),
  });
  return { snap, int };
}
