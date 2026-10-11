/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import { gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";
import {
  inBars,
  limitFor,
  type Cov,
} from "../src/panels/ruler/room/room-frame";
import {
  covOf,
  quantity,
  type Quantity,
} from "../src/panels/ruler/room/room-merge";
import { solveRoom } from "../src/panels/ruler/room/room-solve";
import { dropFrames } from "../src/panels/ruler/room/view-frame";
import {
  AREA_MM2,
  BIG_BOARD,
  BOARD,
  cameraFor,
  CORNERS,
  inBoardFrame,
  MARKS,
  PERIMETER_MM,
  WALLS_MM,
  type Board,
  type P,
} from "./fixtures/room-scene";
import {
  baseCorner,
  exact,
  H,
  roomOf,
  snapOf,
  tapOn,
  W,
  type Mark,
  type Nudge,
} from "./helpers/room-build";

beforeEach(() => dropFrames());

/** Printed only when asked for (ROOM_REPORT=1), to keep the suite quiet. */
const report = (line: string) => {
  if (process.env.ROOM_REPORT) process.stderr.write(`\n[room] ${line}\n`);
};
const CAMS = [0, 1, 2, 3],
  /** Which cameras see each floor corner (two each: the far ones). */
  SEEN_BY = CORNERS.map((c) => CAMS.filter((i) => cameraFor(i, W, H).sees(c)));

/** The whole room as a person would mark it: the four pictures with their
 * references, one mark beside the board in every picture as the anchor, and
 * each floor corner in every picture that shows it. Point 1 is the mark;
 * points 2 to 5 are the corners in order. `cams` limits which pictures a
 * corner is marked in. */
function wholeRoom(
  nudge: Nudge = exact,
  board: Board = BOARD,
  cornerCams: (corner: number) => number[] = (c) => SEEN_BY[c],
) {
  const snaps = CAMS.map((cam) => snapOf({ cam, nudge, board })),
    points: Mark[] = [
      {
        id: 1,
        seen: CAMS.map((cam) => ({
          view: cam + 1,
          at: tapOn(cam, MARKS[0], nudge),
        })),
      },
      ...CORNERS.map((c, i) => ({
        id: i + 2,
        seen: cornerCams(i).map((cam) => ({
          view: cam + 1,
          at: tapOn(cam, c, nudge),
        })),
      })),
    ];
  const room = roomOf(snaps, points, [2, 3, 4, 5], true);
  return { ...solveRoom(room), room };
}
const inside = (q: Quantity | null, truth: number) =>
  !!q && Math.abs(q.value - truth) <= q.error;

describe("the fixture", () => {
  it("shows each floor corner to exactly two cameras, and no camera more than two", () => {
    expect(SEEN_BY.map((s) => s.length)).toEqual([2, 2, 2, 2]);
    for (const cam of CAMS)
      expect(SEEN_BY.filter((s) => s.includes(cam))).toHaveLength(2);
  });
});

describe("a room outlined from four pictures, exact taps", () => {
  it("gives every wall, the perimeter and the area within 1% of truth, inside real bars", () => {
    const sol = wholeRoom(),
      n = sol.numbers!;
    expect(sol.views.map((v) => v.state)).toEqual([
      "first",
      "placed",
      "placed",
      "placed",
    ]);
    WALLS_MM.forEach((mm, i) => {
      expect(Math.abs(n.walls[i]!.value - mm) / mm).toBeLessThan(0.01);
      expect(n.walls[i]!.value).toBeCloseTo(mm, 3);
      expect(n.walls[i]!.error).toBeGreaterThan(1);
      expect(n.walls[i]!.kept).toBe(1);
    });
    expect(
      Math.abs(n.length!.value - PERIMETER_MM) / PERIMETER_MM,
    ).toBeLessThan(0.01);
    expect(Math.abs(n.area!.value - AREA_MM2) / AREA_MM2).toBeLessThan(0.01);
    expect(n.area!.value).toBeCloseTo(AREA_MM2, 0);
    expect(n.area!.error).toBeGreaterThan(1);
    expect(n.selfIntersecting).toBe(false);
    // Each wall rests on the pictures that show its two corners: three of
    // the four, as each corner is in two and neighbours share one.
    expect(sol.wallViews.map((v) => v.length)).toEqual([3, 3, 3, 3]);
    expect(sol.outlineViews).toEqual([1, 2, 3, 4]);
    // Two pictures of one corner agree to a hair with exact taps.
    for (const p of sol.points.slice(1)) {
      expect(p.seen).toHaveLength(2);
      expect(p.apartMm!).toBeLessThan(1e-3);
    }
    report(
      `exact taps, 1000 x 700 mm board: wall bars ${n.walls.map((w) => w!.error.toFixed(0)).join(", ")} mm; perimeter bar ${n.length!.error.toFixed(0)} mm; area ${(n.area!.value / 1e6).toFixed(3)} +- ${(n.area!.error / 1e6).toFixed(3)} m2`,
    );
  });

  it("has no area for an outline that crosses itself, and no numbers while a corner is off the plan", () => {
    const snaps = CAMS.map((cam) => snapOf({ cam })),
      anchor = {
        id: 1,
        seen: CAMS.map((cam) => ({ view: cam + 1, at: tapOn(cam, MARKS[0]) })),
      },
      corners = CORNERS.map((c, i) => ({
        id: i + 2,
        seen: SEEN_BY[i].map((cam) => ({ view: cam + 1, at: tapOn(cam, c) })),
      })),
      crossed = solveRoom(
        roomOf(snaps, [anchor, ...corners], [2, 4, 3, 5], true),
      );
    expect(crossed.numbers!.selfIntersecting).toBe(true);
    expect(crossed.numbers!.area).toBeNull();
    expect(crossed.numbers!.length).not.toBeNull();
    // Open: the walls so far and their total, no area.
    const open = solveRoom(
      roomOf(snaps, [anchor, ...corners], [2, 3, 4], false),
    );
    expect(open.numbers!.walls).toHaveLength(2);
    expect(open.numbers!.area).toBeNull();
    expect(open.numbers!.length!.value).toBeCloseTo(
      WALLS_MM[0] + WALLS_MM[1],
      3,
    );
  });
});

describe("a point marked in two pictures", () => {
  it("is fixed better by both than by either, and a wall ending on it gets a narrower bar", () => {
    // Corner 2 (4200, 3100) is seen by cameras 0 and 3. Mark it in one, in
    // the other, in both.
    const only = (cam: number) => (c: number) => (c === 2 ? [cam] : SEEN_BY[c]),
      a = wholeRoom(exact, BOARD, only(SEEN_BY[2][0])),
      b = wholeRoom(exact, BOARD, only(SEEN_BY[2][1])),
      both = wholeRoom(),
      spread = (sol: typeof a) => {
        const c = covOf(sol.points[3].sample!)!;
        return Math.sqrt(c.xx + c.yy);
      };
    expect(spread(both)).toBeLessThan(spread(a));
    expect(spread(both)).toBeLessThan(spread(b));
    // Walls 2 and 3 end on that corner.
    for (const wall of [1, 2]) {
      const narrow = both.numbers!.walls[wall]!.error;
      expect(narrow).toBeLessThan(a.numbers!.walls[wall]!.error);
      expect(narrow).toBeLessThan(b.numbers!.walls[wall]!.error);
    }
    report(
      `corner seen once or twice, position spread (root of the summed variances): ${spread(a).toFixed(1)} and ${spread(b).toFixed(1)} mm alone, ${spread(both).toFixed(1)} mm combined; wall 3 bar ${a.numbers!.walls[2]!.error.toFixed(0)} and ${b.numbers!.walls[2]!.error.toFixed(0)} mm alone, ${both.numbers!.walls[2]!.error.toFixed(0)} mm combined`,
    );
  });
});

type Got = { q: Quantity; truth: number };
/** Share of retakes holding the truth, and what the bar claims to be (2 sd of
 * the value over real retakes) over the median bar. */
function judge(got: Got[]) {
  const n = got.length,
    hits = got.filter((g) => inside(g.q, g.truth)).length,
    mean = got.reduce((t, g) => t + g.q.value, 0) / n,
    spread =
      2 *
      Math.sqrt(got.reduce((t, g) => t + (g.q.value - mean) ** 2, 0) / (n - 1)),
    bar = got.map((g) => g.q.error).sort((x, y) => x - y)[Math.floor(n / 2)];
  return { share: hits / n, ratio: spread / bar, hits, n, spread, bar };
}

describe.each([
  ["1000 x 700 mm", BOARD],
  ["2000 x 1400 mm", BIG_BOARD],
] as const)("coverage of the merged bars, %s board", (label, board) => {
  it("holds each truth in 90 to 99% of 240 noisy retakes, with bars neither too narrow nor too wide", () => {
    const RETAKES = 240,
      normal = gaussian(seededRandom(20261010)),
      // One tap uncertainty: 1.5 screen pixels at a display scale of 1.
      nudge: Nudge = (p: P) => ({
        x: p.x + 1.5 * normal(),
        y: p.y + 1.5 * normal(),
      }),
      names = ["wall 1", "wall 2", "wall 3", "wall 4", "perimeter", "area"],
      truth = [...WALLS_MM, PERIMETER_MM, AREA_MM2],
      got: Got[][] = names.map(() => []),
      // A linked point on its own: floor corner 3, which two pictures show.
      truthAt = inBoardFrame(
        CORNERS[2],
        baseCorner(wholeRoom(exact, board).room, 0, board),
        board,
      ),
      link: { x: number; y: number; cov: Cov }[] = [];
    let whole = 0,
      measured = 0;
    for (let i = 0; i < RETAKES; i++) {
      dropFrames();
      const sol = wholeRoom(nudge, board);
      if (sol.views.every((v) => v.rigid)) whole++;
      const n = sol.numbers;
      if (!n || n.walls.some((w) => !w) || !n.length || !n.area) continue;
      measured++;
      [...n.walls, n.length, n.area].forEach((q, k) =>
        got[k].push({ q: q!, truth: truth[k] }),
      );
      const p = sol.points[3];
      if (p.seen.length === 2)
        link.push({ ...p.sample!.at, cov: covOf(p.sample!)! });
    }
    report(
      `${label} board, ${RETAKES} retakes: all four pictures on the plan in ${whole}, numbers given in ${measured}`,
    );
    // A picture is refused about 1 time in 20 by design (the 95% region).
    expect(measured / RETAKES).toBeGreaterThanOrEqual(0.9);
    // The linked point's position, judged the same two ways: the 95% region
    // of its own cloud, and each coordinate's spread over the retakes against
    // the spread the cloud claims.
    const held = link.filter(
        (l) =>
          inBars({ x: l.x - truthAt.x, y: l.y - truthAt.y }, l.cov) <=
          limitFor(1),
      ).length,
      sd2 = (v: number[]) => {
        const m = v.reduce((t, x) => t + x, 0) / v.length;
        return (
          2 *
          Math.sqrt(v.reduce((t, x) => t + (x - m) ** 2, 0) / (v.length - 1))
        );
      },
      mid = (v: number[]) => v.sort((x, y) => x - y)[Math.floor(v.length / 2)],
      rx =
        sd2(link.map((l) => l.x)) /
        mid(link.map((l) => 2 * Math.sqrt(l.cov.xx))),
      ry =
        sd2(link.map((l) => l.y)) /
        mid(link.map((l) => 2 * Math.sqrt(l.cov.yy)));
    report(
      `${label} board, a corner marked in two pictures: its 95% region holds the true position in ${held} of ${link.length} retakes (${((held / link.length) * 100).toFixed(1)}%); spread over the retakes against the claimed spread, x ${rx.toFixed(3)}, y ${ry.toFixed(3)}`,
    );
    expect(link.length / RETAKES).toBeGreaterThanOrEqual(0.9);
    expect(held / link.length).toBeGreaterThanOrEqual(0.9);
    expect(held / link.length).toBeLessThanOrEqual(0.99);
    for (const r of [rx, ry]) {
      expect(r).toBeGreaterThan(0.8);
      expect(r).toBeLessThan(1.25);
    }
    names.forEach((name, k) => {
      const j = judge(got[k]);
      report(
        `${label} board, ${name}: ${j.hits} of ${j.n} retakes hold the truth (${(j.share * 100).toFixed(1)}%); 2 sd of the retakes ${j.spread.toPrecision(4)}, median bar ${j.bar.toPrecision(4)}, ratio ${j.ratio.toFixed(3)}`,
      );
      expect(j.share, name).toBeGreaterThanOrEqual(0.9);
      expect(j.share, name).toBeLessThanOrEqual(0.99);
      expect(j.ratio, name).toBeGreaterThan(0.8);
      expect(j.ratio, name).toBeLessThan(1.25);
    });
  }, 300_000);
});

describe("quantity", () => {
  it("is not given when fewer than 80% of the retakes place every point", () => {
    const at = { x: 0, y: 0 },
      far = { x: 1000, y: 0 },
      trials = (missing: number) =>
        Array.from({ length: 10 }, (_, i) =>
          i < missing ? null : { x: i, y: 0 },
        ),
      span = (pts: P[]) => Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
      steady = { at: far, trials: Array.from({ length: 10 }, () => far) };
    expect(quantity([{ at, trials: trials(2) }, steady], span)).not.toBeNull();
    expect(quantity([{ at, trials: trials(3) }, steady], span)).toBeNull();
    expect(quantity([{ at, trials: trials(2) }, steady], span)!.kept).toBe(0.8);
  });
});
