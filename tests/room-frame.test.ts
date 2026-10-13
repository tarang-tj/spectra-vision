/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import { applyHomography } from "../src/panels/ruler/homography";
import { applyRigid } from "../src/panels/ruler/room/room-frame";
import {
  reflections,
  symmetries,
} from "../src/panels/ruler/room/room-symmetry";
import { solveRoom } from "../src/panels/ruler/room/room-solve";
import { dropFrames } from "../src/panels/ruler/room/view-frame";
import {
  BOARD,
  boardCentre,
  cameraFor,
  CORNERS,
  inBoardFrame,
  MARKS,
  type P,
} from "./fixtures/room-scene";
import {
  baseCorner,
  H,
  W,
  roomOf,
  snapOf,
  tapOn,
  type Nudge,
} from "./helpers/room-build";
import { lcgNormal } from "./helpers/seeded";

beforeEach(() => dropFrames());

const rect = (w: number, d: number) => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: d },
  { x: 0, y: d },
];
/** Floor points spread over the room, to compare a placed picture with truth. */
const PROBES: P[] = [...CORNERS, ...MARKS, { x: 3300, y: 700 }];
/** The largest distance (mm) between where picture `n` (1-based) puts the
 * probes in the room's frame and where the hand-written truth has them. */
function worstMiss(
  room: ReturnType<typeof roomOf>,
  n: number,
  cam: number,
  first: number,
  board = BOARD,
) {
  const sol = solveRoom(room),
    view = sol.views[n - 1],
    frame = room.views[n - 1].frame!,
    k = baseCorner(room, first, board);
  if (!view.rigid) throw new Error(view.text);
  return Math.max(
    ...PROBES.map((p) => {
      const own = applyHomography(frame.h, tapOn(cam, p))!,
        got = applyRigid(view.rigid!, own),
        want = inBoardFrame(p, k, board);
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

describe("placing a second picture from two shared points, exact taps", () => {
  // Every ordered pair of the four cameras: quarter turns and half turns both
  // ways. The two floor marks are the shared points.
  const pairs = [0, 1, 2, 3].flatMap((a) =>
    [0, 1, 2, 3].filter((b) => b !== a).map((b) => [a, b] as const),
  );
  it.each(pairs)(
    "cameras %i and %i land on one floor, not turned and not mirrored",
    (a, b) => {
      const room = roomOf(
          [snapOf({ cam: a }), snapOf({ cam: b })],
          [mark(1, MARKS[0], [a, b]), mark(2, MARKS[1], [a, b])],
        ),
        sol = solveRoom(room);
      expect(sol.views[0].state).toBe("first");
      expect(sol.views[1].state, sol.views[1].text).toBe("placed");
      expect(sol.views[1].text).toContain(
        "Room point 1 and Room point 2 agree",
      );
      // Either mark alone leaves the picture off the plan.
      for (const m of MARKS)
        expect(
          solveRoom(
            roomOf(
              [snapOf({ cam: a }), snapOf({ cam: b })],
              [mark(1, m, [a, b])],
            ),
          ).views[1].state,
        ).toBe("provisional");
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
            [mark(1, MARKS[0], [a, b]), mark(2, MARKS[1], [a, b])],
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
    // 400 mm out it decides; with a second shared point the picture is placed.
    const out = mark(1, { x: c.x + 400, y: c.y }, [0, 2]);
    expect(two([out]).views[1].state).toBe("provisional");
    expect(two([out, mark(2, MARKS[1], [0, 2])]).views[1].state).toBe("placed");
  });

  it("refuses when the sheet moved 50 mm between pictures, and not when it did not", () => {
    const moved = two(
      [mark(1, MARKS[0], [0, 2])],
      snapOf({ cam: 2, shift: { x: 50, y: 0 } }),
    );
    expect(moved.views[1].state).toBe("refused");
    expect(moved.views[1].rigid).toBeNull();
    expect(moved.views[1].text).toContain("the sheet moved between pictures");
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
      [mark(1, MARKS[0], [0, 2]), mark(2, MARKS[1], [0, 2])],
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
    // Either alone only suggests a turn (the wrong point the wrong one), and
    // neither alone puts the picture on the plan.
    const right = two([mark(1, MARKS[0], [0, 2])]).views[1],
      fooled = two([wrong]).views[1];
    expect(right.state).toBe("provisional");
    expect(fooled.state).toBe("provisional");
    expect(right.text).toContain("half way round");
    expect(fooled.text).toContain("the same way round");
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
    expect(apart.views[1].text).toContain("these are different spots");
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
    // Points 1 and 2 tie pictures 1 and 2; points 3 and 4 tie pictures 2 and
    // 3 only, so picture 3 can join through picture 2 alone.
    const P3 = { x: 1500, y: 600 },
      P4 = { x: 2900, y: 800 };
    for (const p of [P3, P4])
      for (const cam of [1, 2]) expect(cameraFor(cam, W, H).sees(p)).toBe(true);
    const tie = (id: number, p: P) => ({
        id,
        seen: [
          { view: 2, at: tapOn(1, p) },
          { view: 3, at: tapOn(2, p) },
        ],
      }),
      points = [
        mark(1, MARKS[0], [0, 1]),
        mark(2, MARKS[1], [0, 1]),
        tie(3, P3),
        tie(4, P4),
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
    expect(broken.points[2].sample).toBeNull();
  });
});

describe("a refusal says what to do about each cause", () => {
  const marks = (cams: number[]) => [
    mark(1, MARKS[0], cams),
    mark(2, MARKS[1], cams),
  ];
  /** The same picture with its reference's long and short sides swapped, as
   * the Ruler reads a sheet seen along its long side. */
  const wrongSides = (cam: number) => {
    const good = snapOf({ cam });
    return { ...good, ruler: { ...good.ruler, swap: !good.ruler.swap } };
  };

  it("gives a next step for a moved sheet, for different spots and for swapped sides", () => {
    const moved = solveRoom(
      roomOf(
        [snapOf({ cam: 0 }), snapOf({ cam: 2, shift: { x: 300, y: 0 } })],
        marks([0, 2]),
      ),
    ).views[1];
    expect(moved.state).toBe("refused");
    expect(moved.text).toContain(
      "the sheet moved between pictures (take them again without touching it)",
    );
    expect(moved.text).toContain(
      "these are different spots (unmark the point in one picture and mark the right spot)",
    );
    expect(moved.text).toContain(
      "press Swap sides in the picture where they are wrong",
    );
    // Swapping either picture's sides would not make these agree: no picture
    // is singled out.
    expect(moved.text).not.toContain("the pictures agree");
  });

  it("names the picture whose sides to swap when that would make the pictures agree", () => {
    // Three pictures, the third read the wrong way round. The first two
    // stand, so only the third can be the one.
    const three = [0, 1, 2],
      sol = solveRoom(
        roomOf(
          [snapOf({ cam: 0 }), snapOf({ cam: 1 }), wrongSides(2)],
          marks(three),
        ),
      );
    expect(sol.views.map((v) => v.state)).toEqual([
      "first",
      "placed",
      "refused",
    ]);
    expect(sol.views[2].text).toContain(
      "With the long and short sides of Picture 3's reference swapped, the pictures agree: show Picture 3 and press Swap sides.",
    );
    // Swapped as the message says, it joins.
    expect(
      solveRoom(
        roomOf(
          [snapOf({ cam: 0 }), snapOf({ cam: 1 }), snapOf({ cam: 2 })],
          marks(three),
        ),
      ).views[2].state,
    ).toBe("placed");
  });

  it("names both of two pictures when either could be the one read the wrong way round", () => {
    // The look report's case: the first picture's sheet is read wrongly and
    // the correct second picture cannot join. Two pictures alone cannot say
    // which is wrong, so both are named, with how to tell.
    for (const snaps of [
      [wrongSides(1), snapOf({ cam: 0 })],
      [snapOf({ cam: 1 }), wrongSides(0)],
    ]) {
      const v = solveRoom(roomOf(snaps, marks([1, 0]))).views[1];
      expect(v.state).toBe("refused");
      expect(v.text).toContain(
        "With the long and short sides of Picture 2's or of Picture 1's reference swapped, the pictures agree: look at the lengths written on the sheet's edges in each to see which is wrong, and press Swap sides there.",
      );
    }
  });
});

// 200 solves a case: seconds alone, but the whole suite running beside it on
// a busy machine has pushed one case past the 20 s default three times.
describe("with noisy taps, 200 retakes each", { timeout: 120_000 }, () => {
  const RETAKES = 200;
  type Tally = {
    right: number;
    wrong: number;
    refused: number;
    provisional: number;
  };
  /** Pictures from `cams` with `shared` marked in both, tapped with 1.5 px of
   * noise from a generator that is not the app's own. */
  function run(
    shared: P[],
    cams: [number, number],
    shift?: P,
    /** The second picture is a mirror image; `board` moves the sheet. */
    flip = false,
    board = BOARD,
  ): Tally {
    const normal = lcgNormal(777),
      nudge: Nudge = (p) => ({
        x: p.x + 1.5 * normal(),
        y: p.y + 1.5 * normal(),
      }),
      tally: Tally = { right: 0, wrong: 0, refused: 0, provisional: 0 };
    for (let i = 0; i < RETAKES; i++) {
      dropFrames();
      const room = roomOf(
          [
            snapOf({ cam: cams[0], nudge, board }),
            snapOf({ cam: cams[1], nudge, shift, flip, board }),
          ],
          shared.map((p, k) => ({
            id: k + 1,
            seen: [
              { view: 1, at: tapOn(cams[0], p, nudge) },
              { view: 2, at: tapOn(cams[1], p, nudge, undefined, flip) },
            ],
          })),
        ),
        sol = solveRoom(room);
      if (sol.views[1].state === "provisional") tally.provisional++;
      else if (!sol.views[1].rigid) tally.refused++;
      // The right turn puts the room's far corners within a metre of truth;
      // the wrong one puts them several metres off.
      else if (!flip && worstMiss(room, 2, cams[1], cams[0], board) < 1000)
        tally.right++;
      else tally.wrong++;
    }
    return tally;
  }
  const say = (line: string) => {
    if (process.env.ROOM_REPORT) process.stderr.write(`\n[room] ${line}\n`);
  };
  it("places the picture the right way round nearly always, and never the wrong way", () => {
    const near = run([MARKS[0], MARKS[1]], [0, 2]);
    expect(near.wrong).toBe(0);
    expect(near.right / RETAKES).toBeGreaterThanOrEqual(0.9);
    // A far corner of the room that both show, and one mark: a wide bar on
    // one of the two, still never the wrong way.
    const far = run([CORNERS[3], MARKS[1]], [0, 1]);
    expect(far.wrong).toBe(0);
    expect(far.right / RETAKES).toBeGreaterThanOrEqual(0.9);
    say(
      `two marks beside the board: ${JSON.stringify(near)}; a far corner and a mark: ${JSON.stringify(far)}`,
    );
  });
  it("never places a picture from one shared point, wherever it is", () => {
    for (const p of [boardCentre(), MARKS[0], CORNERS[3]]) {
      const one = run([p], [0, 1]);
      expect(one.right + one.wrong).toBe(0);
    }
    const mid = run([boardCentre()], [0, 2]);
    expect(mid.provisional).toBe(0);
    expect(mid.refused).toBe(RETAKES);
  });
  it("never places a mirror image, wherever its shared marks lie", () => {
    // Any placement of a flipped picture is wrong, so `wrong` counts them.
    const centred = { x: 1600, y: 1200, w: 1000, h: 700 },
      c = { x: 2100, y: 1550 },
      onLine = [
        { x: c.x + 900, y: c.y },
        { x: c.x - 900, y: c.y },
      ],
      line = run(onLine, [0, 2], undefined, true, centred),
      off = run([MARKS[0], MARKS[1]], [0, 2], undefined, true),
      three = run(
        [...onLine, { x: 2900, y: 1900 }],
        [0, 2],
        undefined,
        true,
        centred,
      );
    for (const t of [line, off, three]) expect(t.right + t.wrong).toBe(0);
    expect(line.provisional).toBeGreaterThanOrEqual(0.9 * RETAKES);
    expect(off.refused).toBe(RETAKES);
    expect(three.refused).toBe(RETAKES);
    // A true picture with the same marks: held while they are on the line,
    // placed the right way with the third mark off it.
    const held = run(onLine, [0, 2], undefined, false, centred),
      freed = run(
        [...onLine, { x: 2900, y: 1900 }],
        [0, 2],
        undefined,
        false,
        centred,
      );
    expect(held.right + held.wrong).toBe(0);
    expect(freed.wrong).toBe(0);
    expect(freed.right / RETAKES).toBeGreaterThanOrEqual(0.9);
    say(
      `mirror image, marks on the centre line: ${JSON.stringify(line)}; off it: ${JSON.stringify(off)}; three marks: ${JSON.stringify(three)}. True picture, marks on the line: ${JSON.stringify(held)}; with a third off it: ${JSON.stringify(freed)}`,
    );
  });
  it("refuses a sheet moved 50 mm in at least 9 of 10 retakes, and never places it turned", () => {
    const moved = run([MARKS[0], MARKS[1]], [0, 2], { x: 50, y: 0 });
    expect(moved.wrong).toBe(0);
    expect(moved.refused / RETAKES).toBeGreaterThanOrEqual(0.9);
    say(`sheet moved 50 mm, two marks: ${JSON.stringify(moved)}`);
  });
});

describe("one shared point is never enough", () => {
  // The review's case: the board at the room's middle, pictures from facing
  // cameras, and "the far right corner" marked as one point in both. Those
  // are two different corners, mirror images through the sheet.
  const board = { x: 1600, y: 1200, w: 1000, h: 700 },
    snaps = () => [snapOf({ cam: 0, board }), snapOf({ cam: 2, board })],
    A = { x: 4200, y: 3100 },
    mirrorOfA = { x: 0, y: 0 },
    M = { x: 2900, y: 1700 },
    mistaken = {
      id: 1,
      seen: [
        { view: 1, at: tapOn(0, A) },
        { view: 2, at: tapOn(2, mirrorOfA) },
      ],
    },
    // A wall from a corner only picture 1 shows to a mark only picture 2 shows.
    ends = [
      { id: 8, seen: [{ view: 1, at: tapOn(0, { x: 0, y: 3100 }) }] },
      { id: 9, seen: [{ view: 2, at: tapOn(2, { x: 3000, y: 800 }) }] },
    ],
    WALL_MM = Math.hypot(3000, 2300);

  it("keeps a picture tied in by one point off the plan: provisional, no point, no number", () => {
    const sol = solveRoom(roomOf(snaps(), [mistaken, ...ends], [8, 9]));
    expect(sol.views[1].state).toBe("provisional");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain("Room point 1 alone suggests");
    expect(sol.views[1].text).toContain("Mark a second shared point");
    // Nothing of picture 2 is on the plan, and so no wall is given.
    expect(sol.points.find((p) => p.id === 9)!.sample).toBeNull();
    expect(sol.points.find((p) => p.id === 1)!.seen.map((s) => s.view)).toEqual(
      [1],
    );
    expect(sol.numbers).toBeNull();
    expect(sol.missing).toEqual([9]);
    // The same with a correct single point: still provisional.
    const right = mark(1, A, [0, 2]),
      one = solveRoom(roomOf(snaps(), [right, ...ends], [8, 9]));
    expect(one.views[1].state).toBe("provisional");
    expect(one.views[1].text).toContain("half way round");
    expect(one.numbers).toBeNull();
  });

  it("places it once a second point, elsewhere on the floor, agrees: half a turn, the wall inside its bar", () => {
    const room = roomOf(
        snaps(),
        [mark(1, A, [0, 2]), mark(2, M, [0, 2]), ...ends],
        [8, 9],
      ),
      sol = solveRoom(room);
    expect(sol.views[1].state, sol.views[1].text).toBe("placed");
    expect(sol.views[1].rigid!.turn).toBe(2);
    expect(sol.views[1].text).toContain("Room point 1 and Room point 2 agree");
    const wall = sol.numbers!.walls[0]!;
    expect(Math.abs(wall.value - WALL_MM)).toBeLessThanOrEqual(wall.error);
    expect(Math.abs(wall.value - WALL_MM) / WALL_MM).toBeLessThan(0.01);
  });

  it("refuses when the second point contradicts the first, and names every picture that shares them", () => {
    const sol = solveRoom(
      roomOf(snaps(), [mistaken, mark(2, M, [0, 2]), ...ends], [8, 9]),
    );
    expect(sol.views[1].state).toBe("refused");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain("disagree about which way round");
    expect(sol.views[1].text).toContain(
      "Room point 1 is marked in pictures 1 and 2, Room point 2 in pictures 1 and 2",
    );
    expect(sol.views[1].text).toContain(
      "any one of those marks may be the wrong one",
    );
    expect(sol.numbers).toBeNull();
  });

  it("does not count two points too close together as two", () => {
    // The second point 60 mm from the first: inside the far corner's bar.
    const near = { x: A.x - 60, y: A.y },
      sol = solveRoom(
        roomOf(
          snaps(),
          [mark(1, A, [0, 2]), mark(2, near, [0, 2]), ...ends],
          [8, 9],
        ),
      );
    expect(sol.views[1].state).toBe("provisional");
    expect(sol.views[1].text).toContain("too close together");
    expect(sol.numbers).toBeNull();
    // And the mirrored pair, both mistaken the same way, is not let through
    // by being close together either.
    const both = solveRoom(
      roomOf(snaps(), [
        mistaken,
        {
          id: 2,
          seen: [
            { view: 1, at: tapOn(0, near) },
            { view: 2, at: tapOn(2, { x: 60, y: 0 }) },
          ],
        },
      ]),
    );
    expect(both.views[1].state).toBe("provisional");
  });

  describe("with a third picture (camera 1)", () => {
    const three = () => [0, 2, 1].map((cam) => snapOf({ cam, board })),
      N = { x: 1200, y: 2300 },
      // Picture 3 tied to picture 1 by two true points.
      tie = [
        {
          id: 2,
          seen: [
            { view: 1, at: tapOn(0, M) },
            { view: 3, at: tapOn(1, M) },
          ],
        },
        {
          id: 3,
          seen: [
            { view: 1, at: tapOn(0, N) },
            { view: 3, at: tapOn(1, N) },
          ],
        },
      ];
    it("a: tied to picture 1 only, it is placed and picture 2 stays provisional", () => {
      const sol = solveRoom(roomOf(three(), [mistaken, ...tie]));
      expect(sol.views.map((v) => v.state)).toEqual([
        "first",
        "provisional",
        "placed",
      ]);
    });
    it("b: when it also shares a true point with picture 2, picture 2 is the one refused", () => {
      const shared = {
          id: 4,
          seen: [
            { view: 2, at: tapOn(2, { x: 1000, y: 600 }) },
            { view: 3, at: tapOn(1, { x: 1000, y: 600 }) },
          ],
        },
        sol = solveRoom(roomOf(three(), [mistaken, ...tie, shared]));
      expect(sol.views.map((v) => v.state)).toEqual([
        "first",
        "refused",
        "placed",
      ]);
      expect(sol.views[1].text).toContain("Picture 2 is not on the plan");
      expect(sol.views[1].text).toContain(
        "Room point 1 is marked in pictures 1 and 2",
      );
      expect(sol.views[1].text).toContain("Room point 4 in pictures 2 and 3");
    });
    it("c: a second true point between pictures 1 and 2 refuses picture 2", () => {
      const sol = solveRoom(
        roomOf(three(), [mistaken, ...tie, mark(5, N, [0, 2])]),
      );
      expect(sol.views.map((v) => v.state)).toEqual([
        "first",
        "refused",
        "placed",
      ]);
    });
  });
});

describe("a picture and its mirror image", () => {
  // The verifier's case: the board at the room's middle, facing cameras, the
  // second picture saved flipped left to right, and two true shared marks on
  // the sheet's long centre line. A reflection across that line leaves both
  // marks where they are, so a turn fits them as well as the mirror does.
  const board = { x: 1600, y: 1200, w: 1000, h: 700 },
    c = { x: 2100, y: 1550 },
    L1 = { x: c.x + 900, y: c.y },
    L2 = { x: c.x - 900, y: c.y },
    OFF = { x: 2900, y: 1900 },
    probe = { id: 9, seen: [{ view: 2, at: tapOn(2, { x: 3000, y: 800 }) }] },
    both = (id: number, p: P, flip: boolean) => ({
      id,
      seen: [
        { view: 1, at: tapOn(0, p) },
        { view: 2, at: tapOn(2, p, undefined, undefined, flip) },
      ],
    }),
    solve = (flip: boolean, marks: P[]) =>
      solveRoom(
        roomOf(
          [snapOf({ cam: 0, board }), snapOf({ cam: 2, board, flip })],
          [...marks.map((p, i) => both(i + 1, p, flip)), probe],
        ),
      );

  it("keeps a flipped picture off the plan when its two marks lie on the sheet's centre line", () => {
    const sol = solve(true, [L1, L2]);
    expect(sol.views[1].state).toBe("provisional");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain(
      "lie on a line through the middle of the sheet, so they cannot tell this picture from its mirror image",
    );
    expect(sol.views[1].text).toContain(
      "Mark a shared point well off that line",
    );
    expect(sol.points.find((p) => p.id === 9)!.sample).toBeNull();
    // The short centre line too, and marks 10 mm off the line.
    const S1 = { x: c.x, y: c.y + 700 },
      S2 = { x: c.x, y: c.y - 700 };
    expect(solve(true, [S1, S2]).views[1].state).toBe("provisional");
    expect(
      solve(true, [
        { x: L1.x, y: L1.y + 10 },
        { x: L2.x, y: L2.y + 10 },
      ]).views[1].rigid,
    ).toBeNull();
  });

  it("refuses a flipped picture as a mirror image once a mark off the line is shared", () => {
    const sol = solve(true, [L1, L2, OFF]);
    expect(sol.views[1].state).toBe("refused");
    expect(sol.views[1].rigid).toBeNull();
    expect(sol.views[1].text).toContain(
      "appears to be a mirror image (flipped left to right)",
    );
    // And with two marks anywhere off the lines.
    const two = solve(true, [OFF, { x: 1300, y: 2300 }]);
    expect(two.views[1].state).toBe("refused");
    expect(two.views[1].text).toContain("appears to be a mirror image");
  });

  it("holds a true picture whose two marks lie on the centre line until a mark off the line agrees", () => {
    const on = solve(false, [L1, L2]);
    expect(on.views[1].state).toBe("provisional");
    expect(on.views[1].text).toContain(
      "Mark a shared point well off that line",
    );
    const with3 = solve(false, [L1, L2, OFF]);
    expect(with3.views[1].state, with3.views[1].text).toBe("placed");
    expect(with3.views[1].rigid!.turn).toBe(2);
    expect(with3.points.find((p) => p.id === 9)!.sample).not.toBeNull();
    // Two marks off the lines place a true picture as before.
    expect(solve(false, [OFF, { x: 1300, y: 2300 }]).views[1].state).toBe(
      "placed",
    );
  });

  it("finds two reflections of a rectangle onto itself and four of a square", () => {
    expect(reflections(rect(1000, 700), rect(1000, 700))).toHaveLength(2);
    expect(reflections(rect(700, 1000), rect(1000, 700))).toHaveLength(2);
    expect(reflections(rect(500, 500), rect(500, 500))).toHaveLength(4);
    expect(reflections(rect(1000, 700), rect(297, 210))).toEqual([]);
    for (const m of reflections(rect(1000, 700), rect(1000, 700))) {
      // Each lays the rectangle on itself and is not a turn: it reverses the
      // way round the corners run.
      const got = rect(1000, 700).map((p) => applyRigid(m, p)),
        area = got.reduce(
          (t, p, i) => t + p.x * got[(i + 1) % 4].y - got[(i + 1) % 4].x * p.y,
          0,
        );
      expect(area).toBeCloseTo(-2 * 1000 * 700, 6);
      for (const p of got)
        expect(
          rect(1000, 700).some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 1e-9),
        ).toBe(true);
    }
  });
});

describe("a mirror image with marks near the sheet's centre lines, noisy", () => {
  // The verifier's sweep, on this repo's fixture: a flipped second picture,
  // two true shared marks e mm off a centre line of the sheet, 1.5 px of
  // noise on every tap of both pictures. Any placement is a mirrored one.
  // ROOM_SWEEP sets the runs per step (2,000 gives the 200,000 of the
  // report); the default keeps the suite short and stays near the line,
  // where every placement the sweep ever found lay.
  const PER = Number(process.env.ROOM_SWEEP ?? 60),
    full = !!process.env.ROOM_SWEEP,
    board = { x: 1600, y: 1200, w: 1000, h: 700 },
    c = { x: 2100, y: 1550 },
    layouts: Record<string, (e: number) => P[]> = {
      "long line, both the same side": (e) => [
        { x: c.x + 900, y: c.y + e },
        { x: c.x - 900, y: c.y + e },
      ],
      "long line, one on and one off": (e) => [
        { x: c.x + 900, y: c.y },
        { x: c.x - 900, y: c.y + e },
      ],
      "long line, opposite sides": (e) => [
        { x: c.x + 900, y: c.y + e },
        { x: c.x - 900, y: c.y - e },
      ],
      "short line, both the same side": (e) => [
        { x: c.x + e, y: c.y + 800 },
        { x: c.x + e, y: c.y - 800 },
      ],
    };
  /** How the second picture came out over `PER` noisy runs. */
  function sweep(marks: P[], flip: boolean, normal: () => number) {
    const nudge: Nudge = (p) => ({
        x: p.x + 1.5 * normal(),
        y: p.y + 1.5 * normal(),
      }),
      t = { placed: 0, provisional: 0, refused: 0 };
    for (let i = 0; i < PER; i++) {
      dropFrames();
      const v = solveRoom(
        roomOf(
          [
            snapOf({ cam: 0, nudge, board }),
            snapOf({ cam: 2, nudge, board, flip }),
          ],
          marks.map((p, k) => ({
            id: k + 1,
            seen: [
              { view: 1, at: tapOn(0, p, nudge) },
              { view: 2, at: tapOn(2, p, nudge, undefined, flip) },
            ],
          })),
        ),
      ).views[1];
      if (v.rigid) t.placed++;
      else if (v.state === "provisional") t.provisional++;
      else t.refused++;
    }
    return t;
  }
  const say = (line: string) => {
    if (process.env.ROOM_REPORT) process.stderr.write(`\n[room] ${line}\n`);
  };

  it("places no flipped picture at any offset from the line", () => {
    const normal = lcgNormal(31337),
      steps = full
        ? Array.from({ length: 25 }, (_, i) => i * 5)
        : [0, 5, 10, 15, 20];
    let runs = 0,
      placed = 0;
    for (const [name, at] of Object.entries(layouts)) {
      const rows: string[] = [];
      let here = 0;
      for (const e of steps) {
        const t = sweep(at(e), true, normal);
        runs += PER;
        here += t.placed;
        if (t.placed) rows.push(`${e} mm: ${t.placed}`);
      }
      placed += here;
      say(
        `mirror sweep, ${name}: placed ${here} of ${steps.length * PER}${rows.length ? ` (${rows.join(", ")})` : ""}`,
      );
    }
    say(
      `mirror sweep: ${placed} placed mirrored in ${runs} noisy flipped runs`,
    );
    expect(placed).toBe(0);
  }, 3_000_000);

  it("holds a true picture with marks near the line, and places it once they are clear of it", () => {
    const normal = lcgNormal(4141),
      at = layouts["long line, both the same side"],
      rows = [0, 20, 40, 60, 80, 100, 150, 200].map((e) => ({
        e,
        ...sweep(at(e), false, normal),
      }));
    say(
      `true picture, both marks e mm off the long centre line, of ${PER}: ${rows.map((r) => `${r.e} mm placed ${r.placed}, held ${r.provisional}, refused ${r.refused}`).join("; ")}`,
    );
    // On the line it is held; well clear of it, placed.
    expect(rows[0].placed).toBe(0);
    // 20 mm off is still held: with the margin at 2 about 4 in 10 of these
    // were placed, and that is the margin a flipped picture slipped through.
    expect(rows[1].placed).toBe(0);
    expect(rows[rows.length - 1].placed / PER).toBeGreaterThanOrEqual(0.9);
  }, 3_000_000);
});
