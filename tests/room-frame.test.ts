/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import { applyHomography } from "../src/panels/ruler/homography";
import { gaussian, seededRandom } from "../src/panels/ruler/monte-carlo";
import { applyRigid, symmetries } from "../src/panels/ruler/room/room-frame";
import { solveRoom } from "../src/panels/ruler/room/room-solve";
import { dropFrames } from "../src/panels/ruler/room/view-frame";
import {
  BOARD,
  boardCentre,
  boardCorners,
  CORNERS,
  inBoardFrame,
  MARKS,
  type P,
} from "./fixtures/room-scene";
import { roomOf, snapOf, tapOn, type Nudge } from "./helpers/room-build";

beforeEach(() => dropFrames());

const rect = (w: number, d: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];
/** Floor points spread over the room, to compare a placed picture with truth. */
const PROBES: P[] = [...CORNERS, ...MARKS, { x: 3300, y: 700 }];
/** Which board corner the first picture's frame starts at: the one whose
 * hand-written frame agrees with where that picture's own map puts the
 * board's corners. `cam` is the camera that took the first picture. */
function baseCorner(room: ReturnType<typeof roomOf>, cam: number): number {
  const f = room.views[0].frame!,
    miss = [0, 1, 2, 3].map((k) =>
      Math.max(
        ...boardCorners().map((c) => {
          const want = inBoardFrame(c, k),
            got = applyHomography(f.h, tapOn(cam, c))!;
          return Math.hypot(want.x - got.x, want.y - got.y);
        }),
      ),
    ),
    k = miss.indexOf(Math.min(...miss));
  // Noisy taps move the board's corners by millimetres, never by a side.
  if (miss[k] > 100) throw new Error("the frame starts at no board corner");
  return k;
}
/** The largest distance (mm) between where picture `n` (1-based) puts the
 * probes in the room's frame and where the hand-written truth has them. */
function worstMiss(
  room: ReturnType<typeof roomOf>,
  n: number,
  cam: number,
  first: number,
) {
  const sol = solveRoom(room),
    view = sol.views[n - 1],
    frame = room.views[n - 1].frame!,
    k = baseCorner(room, first);
  if (!view.rigid) throw new Error(view.text);
  return Math.max(
    ...PROBES.map((p) => {
      const own = applyHomography(frame.h, tapOn(cam, p))!,
        got = applyRigid(view.rigid!, own),
        want = inBoardFrame(p, k);
      return Math.hypot(got.x - want.x, got.y - want.y);
    }),
  );
}
const mark = (id: number, p: P, cams: number[], nudge?: Nudge) => ({
  id,
  seen: cams.map((cam, i) => ({ view: i + 1, at: tapOn(cam, p, nudge) })),
});

describe("the turns of a reference onto itself", () => {
  it("is two for a rectangle read the same way, two for one read crosswise, four for a square, none for another size", () => {
    expect(
      symmetries(rect(1000, 700), rect(1000, 700)).map((t) => t.turn),
    ).toEqual([0, 2]);
    expect(
      symmetries(rect(700, 1000), rect(1000, 700)).map((t) => t.turn),
    ).toEqual([1, 3]);
    expect(
      symmetries(rect(500, 500), rect(500, 500)).map((t) => t.turn),
    ).toEqual([0, 1, 2, 3]);
    expect(symmetries(rect(1000, 700), rect(297, 210))).toEqual([]);
    for (const from of [rect(1000, 700), rect(700, 1000)])
      for (const t of symmetries(from, rect(1000, 700)))
        from.forEach((c, i) => {
          const m = applyRigid(t, c),
            want = rect(1000, 700)[(t.turn + i) % 4];
          expect(Math.hypot(m.x - want.x, m.y - want.y)).toBeLessThan(1e-9);
        });
  });
});

describe("placing a second picture from one anchor, exact taps", () => {
  // Every ordered pair of the four cameras: quarter turns and half turns both
  // ways. One mark beside the board is the anchor.
  const pairs = [0, 1, 2, 3].flatMap((a) =>
    [0, 1, 2, 3].filter((b) => b !== a).map((b) => [a, b] as const),
  );
  it.each(pairs)(
    "cameras %i and %i land on one floor, not turned and not mirrored",
    (a, b) => {
      const room = roomOf(
          [snapOf({ cam: a }), snapOf({ cam: b })],
          [mark(1, MARKS[0], [a, b])],
        ),
        sol = solveRoom(room);
      expect(sol.views[0].state).toBe("first");
      expect(sol.views[1].state, sol.views[1].text).toBe("placed");
      expect(sol.views[1].text).toContain("Room point 1 decides it");
      // Against hand-written truth, over the whole room.
      expect(worstMiss(room, 1, a, a)).toBeLessThan(1e-3);
      expect(worstMiss(room, 2, b, a)).toBeLessThan(1e-3);
      // The pair is a real test of the turn: its own frame is not the room's.
      const own = room.views[1].frame!,
        raw = Math.max(
          ...PROBES.map((p) => {
            const got = applyHomography(own.h, tapOn(b, p))!,
              want = inBoardFrame(p, baseCorner(room, a));
            return Math.hypot(got.x - want.x, got.y - want.y);
          }),
        );
      expect(raw).toBeGreaterThan(500);
    },
  );
  it("covers every turn across the pairs", () => {
    const turns = new Set(
      pairs.map(([a, b]) => {
        const sol = solveRoom(
          roomOf(
            [snapOf({ cam: a }), snapOf({ cam: b })],
            [mark(1, MARKS[0], [a, b])],
          ),
        );
        return sol.views[1].rigid!.turn;
      }),
    );
    expect([...turns].sort()).toEqual([1, 2, 3]);
  });
});

describe("refusals", () => {
  const two = (
    points: ReturnType<typeof mark>[],
    second = snapOf({ cam: 2 }),
  ) => solveRoom(roomOf([snapOf({ cam: 0 }), second], points));

  it("leaves a picture with no anchor off the plan, with its points", () => {
    const only = { id: 2, seen: [{ view: 2, at: tapOn(2, CORNERS[0]) }] },
      sol = solveRoom(
        roomOf(
          [snapOf({ cam: 0 }), snapOf({ cam: 2 })],
          [{ id: 1, seen: [{ view: 1, at: tapOn(0, CORNERS[2]) }] }, only],
          [1, 2],
        ),
      );
    expect(sol.views[1].state).toBe("unanchored");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain("not on the plan yet");
    expect(sol.points[1].sample).toBeNull();
    expect(sol.points[1].seen).toEqual([]);
    expect(sol.missing).toEqual([2]);
    expect(sol.numbers).toBeNull();
    expect(sol.points[0].sample).not.toBeNull();
  });

  it("refuses an anchor at the middle of the sheet: it cannot decide", () => {
    const sol = two([mark(1, boardCentre(), [0, 2])]);
    expect(sol.views[1].state).toBe("refused");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain("cannot tell which way round");
    expect(sol.views[1].checks[0].verdict).toBe("undecided");
    // 60 mm from the middle is still inside the bars; 400 mm is not.
    const c = boardCentre();
    expect(two([mark(1, { x: c.x + 12, y: c.y }, [0, 2])]).views[1].state).toBe(
      "refused",
    );
    expect(
      two([mark(1, { x: c.x + 400, y: c.y }, [0, 2])]).views[1].state,
    ).toBe("placed");
  });

  it("refuses when the sheet moved 50 mm between pictures, and not when it did not", () => {
    const moved = two(
      [mark(1, MARKS[0], [0, 2])],
      snapOf({ cam: 2, shift: { x: 50, y: 0 } }),
    );
    expect(moved.views[1].state).toBe("refused");
    expect(moved.views[1].rigid).toBeNull();
    expect(moved.views[1].text).toContain("may have moved between pictures");
    const check = moved.views[1].checks[0];
    expect(check.verdict).toBe("apart");
    expect(check.gapMm).toBeGreaterThan(49);
    expect(check.gapMm).toBeLessThan(51);
    expect(check.allowedMm).toBeLessThan(check.gapMm);
    expect(moved.views[1].text).toContain(`${Math.round(check.gapMm)} mm`);
    // Any direction.
    for (const shift of [
      { x: 0, y: 50 },
      { x: -35, y: 35 },
      { x: 0, y: -50 },
    ])
      expect(
        two([mark(1, MARKS[0], [0, 2])], snapOf({ cam: 2, shift })).views[1]
          .state,
        JSON.stringify(shift),
      ).toBe("refused");
    // A move far inside the bars cannot be seen, and is not refused.
    const still = two(
      [mark(1, MARKS[0], [0, 2])],
      snapOf({ cam: 2, shift: { x: 2, y: 0 } }),
    );
    expect(still.views[1].state).toBe("placed");
    expect(still.views[1].checks[0].allowedMm).toBeGreaterThan(2);
  });

  it("refuses when a second anchor contradicts the first", () => {
    const c = boardCentre(),
      p = MARKS[1],
      // The same mark tapped in picture 2 where a half turn of the sheet
      // would put it: a different floor point that fits the other turn.
      turned = { x: 2 * c.x - p.x, y: 2 * c.y - p.y },
      wrong = {
        id: 2,
        seen: [
          { view: 1, at: tapOn(0, p) },
          { view: 2, at: tapOn(2, turned) },
        ],
      },
      sol = two([mark(1, MARKS[0], [0, 2]), wrong]);
    expect(sol.views[1].state).toBe("refused");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain("disagree about which way round");
    expect(sol.views[1].text).toContain("Room point 1");
    expect(sol.views[1].text).toContain("Room point 2");
    // Either anchor alone would have been taken: the refusal needs both.
    expect(two([mark(1, MARKS[0], [0, 2])]).views[1].state).toBe("placed");
    expect(two([wrong]).views[1].state).toBe("placed");
    // A second anchor that is simply another point is refused as apart.
    const other = {
      id: 2,
      seen: [
        { view: 1, at: tapOn(0, MARKS[1]) },
        { view: 2, at: tapOn(2, { x: MARKS[1].x + 300, y: MARKS[1].y }) },
      ],
    };
    const apart = two([mark(1, MARKS[0], [0, 2]), other]);
    expect(apart.views[1].state).toBe("refused");
    expect(apart.views[1].text).toContain("these are different points");
  });

  it("refuses a picture whose reference is another size, and waits for one with none", () => {
    const small = snapOf({ cam: 2, board: { ...BOARD, w: 800 } }),
      sol = two([mark(1, MARKS[0], [0, 2])], small);
    expect(sol.views[1].state).toBe("refused");
    expect(sol.views[1].text).toContain("not the size of the first picture's");
    const none = solveRoom(
      roomOf([snapOf({ cam: 0 }), null], [mark(1, MARKS[0], [0, 2])]),
    );
    expect(none.views[1].state).toBe("no-reference");
    expect(none.views[1].rigid).toBeNull();
  });

  it("places a third picture through the second, and takes both off when the second is refused", () => {
    // Point 1 ties pictures 1 and 2; point 2 ties pictures 2 and 3 only.
    const points = [
        mark(1, MARKS[0], [0, 1]),
        {
          id: 2,
          seen: [
            { view: 2, at: tapOn(1, MARKS[1]) },
            { view: 3, at: tapOn(2, MARKS[1]) },
          ],
        },
      ],
      snaps = [snapOf({ cam: 0 }), snapOf({ cam: 1 }), snapOf({ cam: 2 })],
      chain = roomOf(snaps, points),
      sol = solveRoom(chain);
    expect(sol.views.map((v) => v.state)).toEqual([
      "first",
      "placed",
      "placed",
    ]);
    expect(worstMiss(chain, 3, 2, 0)).toBeLessThan(1e-3);
    const broken = solveRoom(
      roomOf(
        [snaps[0], snapOf({ cam: 1, shift: { x: 50, y: 0 } }), snaps[2]],
        points,
      ),
    );
    expect(broken.views.map((v) => v.state)).toEqual([
      "first",
      "refused",
      "unanchored",
    ]);
    expect(broken.points[1].sample).toBeNull();
  });

  it("keeps a later picture off when a point it shares with an earlier one disagrees", () => {
    // Picture 2 joins through a mark tapped half a turn off, so it is placed
    // the wrong way round and nothing in pictures 1 and 2 alone can show it.
    // Picture 3 joins picture 1 correctly and shares one correct mark with
    // picture 2: that mark fits only the other turn, so picture 3 is refused.
    const c = boardCentre(),
      p = MARKS[1],
      turned = { x: 2 * c.x - p.x, y: 2 * c.y - p.y },
      probe = { x: 3300, y: 700 },
      wrong = {
        id: 1,
        seen: [
          { view: 1, at: tapOn(0, p) },
          { view: 2, at: tapOn(2, turned) },
        ],
      },
      good = {
        id: 2,
        seen: [
          { view: 1, at: tapOn(0, MARKS[0]) },
          { view: 3, at: tapOn(1, MARKS[0]) },
        ],
      },
      shared = {
        id: 3,
        seen: [
          { view: 2, at: tapOn(2, probe) },
          { view: 3, at: tapOn(1, probe) },
        ],
      },
      snaps = [snapOf({ cam: 0 }), snapOf({ cam: 2 }), snapOf({ cam: 1 })],
      sol = solveRoom(roomOf(snaps, [wrong, good, shared]));
    expect(sol.views.map((v) => v.state)).toEqual([
      "first",
      "placed",
      "refused",
    ]);
    expect(sol.views[2].text).toContain(
      "Room point 2 and Room point 3 disagree about which way round",
    );
    // Without the shared mark nothing ties pictures 2 and 3, and both stand.
    expect(
      solveRoom(roomOf(snaps, [wrong, good])).views.map((v) => v.state),
    ).toEqual(["first", "placed", "placed"]);
  });
});

describe("with noisy taps, 200 retakes each", () => {
  const RETAKES = 200;
  function run(
    at: P,
    cams: [number, number],
    shift?: P,
  ): { right: number; wrong: number; refused: number } {
    const normal = gaussian(seededRandom(777)),
      nudge: Nudge = (p) => ({
        x: p.x + 1.5 * normal(),
        y: p.y + 1.5 * normal(),
      }),
      tally = { right: 0, wrong: 0, refused: 0 };
    for (let i = 0; i < RETAKES; i++) {
      dropFrames();
      const room = roomOf(
          [
            snapOf({ cam: cams[0], nudge }),
            snapOf({ cam: cams[1], nudge, shift }),
          ],
          [mark(1, at, cams, nudge)],
        ),
        sol = solveRoom(room);
      if (!sol.views[1].rigid) tally.refused++;
      // The right turn puts the room's far corners within a metre of truth;
      // the wrong one puts them several metres off.
      else if (worstMiss(room, 2, cams[1], cams[0]) < 1000) tally.right++;
      else tally.wrong++;
    }
    return tally;
  }
  it("places the picture the right way round nearly always, and never the wrong way", () => {
    const near = run(MARKS[0], [0, 2]);
    expect(near.wrong).toBe(0);
    expect(near.right / RETAKES).toBeGreaterThanOrEqual(0.9);
    // A shared far corner of the room: a wide bar, still never the wrong way.
    const far = run(CORNERS[2], [0, 1]);
    expect(far.wrong).toBe(0);
    expect(far.right / RETAKES).toBeGreaterThanOrEqual(0.9);
    if (process.env.ROOM_REPORT)
      process.stderr.write(
        `\n[room] anchor beside the board: ${JSON.stringify(near)}; anchor at a far corner: ${JSON.stringify(far)}\n`,
      );
  });
  it("never places a picture from an anchor at the middle of the sheet", () => {
    const mid = run(boardCentre(), [0, 2]);
    expect(mid.right + mid.wrong).toBe(0);
  });
  it("refuses a sheet moved 50 mm in at least 9 of 10 retakes", () => {
    const moved = run(MARKS[0], [0, 2], { x: 50, y: 0 });
    expect(moved.wrong).toBe(0);
    expect(moved.refused / RETAKES).toBeGreaterThanOrEqual(0.9);
    if (process.env.ROOM_REPORT)
      process.stderr.write(
        `\n[room] sheet moved 50 mm: ${JSON.stringify(moved)}\n`,
      );
  });
});
