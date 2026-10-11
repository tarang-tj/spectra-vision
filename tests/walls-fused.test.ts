/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Walls tool with a known span fused into the floor: the room against
// truth, and what the sentence beside the numbers says the bars cover.
import { describe, it, expect } from "vitest";
import { derive } from "../src/panels/ruler/derive";
import { BASIS, gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";
import {
  bindSource,
  getState,
  place,
  resetRuler,
  setCustom,
  setKnown,
  setRef,
  setTape,
  setUnit,
} from "../src/panels/ruler/store";
import { currentWalls } from "../src/panels/ruler/walls/current";
import { wallsCsv } from "../src/panels/ruler/walls/export-shell";
import { addCorner, closeRoom, setTop } from "../src/panels/ruler/walls/store";
import {
  boardCorners,
  RECT,
  ROOM,
  sceneFor,
  type P,
} from "./fixtures/walls-scene";

const W = 1920,
  H = 1440,
  scene = sceneFor(W, H),
  AREA = ROOM.w * ROOM.d;

/** The board and the room tapped, all four ceiling points set; then, when
 * asked, the far wall's foot measured as a span and typed in as a known
 * 4200 mm. Every tap goes through `nudge`. */
function read(known: boolean, nudge = (p: P) => p) {
  const shoot = (x: number, y: number, z = 0) => nudge(scene.shoot(x, y, z));
  resetRuler();
  setRef("custom");
  setCustom("1000", "700");
  setUnit("mm");
  bindSource(1, W, H, 1);
  for (const c of boardCorners()) place(shoot(c.x, c.y));
  if (known) {
    place(shoot(RECT[3].x, RECT[3].y));
    place(shoot(RECT[2].x, RECT[2].y));
    setTape(0, String(ROOM.w));
    setKnown(0, true);
  }
  for (const c of RECT) addCorner(shoot(c.x, c.y));
  closeRoom();
  RECT.forEach((c, i) => setTop(i, shoot(c.x, c.y, ROOM.h)));
  const s = getState(),
    d = derive(s),
    cur = currentWalls(s, d);
  return { fused: d.sheet?.fused ?? null, cur, n: cur.numbers!, d };
}

describe("the Walls tool with a known span in view", () => {
  it("gives the true room, with narrower bars than the board alone", () => {
    const plain = read(false),
      known = read(true),
      n = known.n;
    expect(plain.fused).toBeNull();
    expect(known.fused).toMatchObject({ rects: 0, spans: 1 });
    [ROOM.w, ROOM.d, ROOM.w, ROOM.d].forEach((mm, i) =>
      expect(n.walls[i]!.value).toBeCloseTo(mm, 1),
    );
    n.heights.forEach((q) => expect(q!.value).toBeCloseTo(ROOM.h, 1));
    expect(n.meanHeight!.value).toBeCloseTo(ROOM.h, 1);
    expect(n.floorArea!.value / AREA).toBeCloseTo(1, 6);
    expect(n.volume!.value / (AREA * ROOM.h)).toBeCloseTo(1, 6);
    expect(n.kept).toBe(1);
    expect(known.cur.offCorners).toEqual([]);
    // The known span is wall 3 itself, so that wall gains the most.
    expect(n.walls[2]!.error).toBeGreaterThan(1);
    expect(n.walls[2]!.error).toBeLessThan(plain.n.walls[2]!.error / 4);
    for (const key of ["floorArea", "meanHeight", "volume"] as const) {
      expect(n[key]!.error).toBeGreaterThan(0);
      expect(n[key]!.error).toBeLessThan(plain.n[key]!.error);
    }
  });

  it("holds the true height and floor area in most noisy retakes", () => {
    const RETAKES = 200,
      normal = gaussian(seededRandom(4242)),
      nudge = (p: P) => ({ x: p.x + 1.5 * normal(), y: p.y + 1.5 * normal() });
    let height = 0,
      area = 0;
    for (let i = 0; i < RETAKES; i++) {
      const { n } = read(true, nudge),
        h = n.meanHeight!,
        a = n.floorArea!;
      if (Math.abs(h.value - ROOM.h) <= h.error) height++;
      if (Math.abs(a.value - AREA) <= a.error) area++;
    }
    console.info(
      `walls, known span: ${height} of ${RETAKES} retakes hold the true height, ${area} of ${RETAKES} the true floor area`,
    );
    // Observed 2026-10-10: height 191 of 200 (95.5%), floor area 187 of 200
    // (93.5%). Each floor is that less 2 sd of a count over 200 retakes
    // (about 3.5 points). The Ruler's own sentence, shown inside the Walls
    // one, already says a known span with one reference covers 91 to 94.
    expect(height / RETAKES).toBeGreaterThanOrEqual(0.92);
    expect(area / RETAKES).toBeGreaterThanOrEqual(0.9);
  }, 300_000);

  it("says what the bars cover, differently once a known span is fused in", () => {
    const plain = read(false),
      known = read(true),
      was = plain.cur.basis,
      now = known.cur.basis;
    // The Ruler's own sentence sits inside, with the tool's assumptions.
    expect(was).toContain(BASIS);
    expect(was).toContain("Assumes a flat floor, plumb walls");
    expect(now).not.toBe(was);
    expect(now).not.toContain(BASIS);
    expect(now).toContain("the ends of every known span included");
    expect(now).toContain("a tape uncertainty of 2 mm on each typed length");
    expect(now).toContain("Assumes a flat floor, plumb walls");
    expect(now).toContain(derive(getState()).basis);
    // The saved CSV carries the same sentence as the panel.
    const csv = wallsCsv(known.n, "mm", null, now);
    expect(csv).toContain("the ends of every known span included");
    expect(wallsCsv(plain.n, "mm", null, was)).not.toContain("known span");
  });
});
