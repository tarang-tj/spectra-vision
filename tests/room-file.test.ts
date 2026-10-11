/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  derivedNumbers,
  MAX_FILE_BYTES,
  numbersThatDiffer,
  roomFile,
  type RoomFile,
} from "../src/panels/ruler/room/room-file";
import { parseRoomFile } from "../src/panels/ruler/room/room-file-parse";
import { solveRoom } from "../src/panels/ruler/room/room-solve";
import { dropFrames } from "../src/panels/ruler/room/view-frame";
import type { View, ViewSnap } from "../src/panels/ruler/room/views-store";
import { AREA_MM2, cameraFor, CORNERS, MARKS } from "./fixtures/room-scene";
import { H, roomOf, snapOf, tapOn, W, type Mark } from "./helpers/room-build";
import { randomSnaps } from "./helpers/room-random";

beforeEach(() => dropFrames());

const asViews = (snaps: ViewSnap[]): View[] =>
  snaps.map((snap, i) => ({
    id: i + 1,
    label: `cam-${i}.png`,
    blob: null,
    thumb: null,
    snap,
    generation: null,
  }));
const PNG = "data:image/png;base64,iVBORw0KGgo=";

/** The synthetic room marked in all four pictures, with a span and an
 * outline tapped in picture 2 as well. */
function marked() {
  const snaps = [0, 1, 2, 3].map((cam) => snapOf({ cam }));
  snaps[1] = {
    ...snaps[1],
    ruler: {
      ...snaps[1].ruler,
      measures: [{ a: tapOn(1, MARKS[0]), b: tapOn(1, MARKS[1]) }],
      shapes: [
        {
          kind: "area",
          done: true,
          pts: [MARKS[0], MARKS[1], { x: 2000, y: 2300 }].map((p) =>
            tapOn(1, p),
          ),
        },
      ],
    },
  };
  const points: Mark[] = [
      {
        id: 1,
        seen: [0, 1, 2, 3].map((cam) => ({
          view: cam + 1,
          at: tapOn(cam, MARKS[0]),
        })),
      },
      ...CORNERS.map((c, i) => ({
        id: i + 2,
        seen: [0, 1, 2, 3]
          .filter((cam) => cameraFor(cam, W, H).sees(c))
          .map((cam) => ({ view: cam + 1, at: tapOn(cam, c) })),
      })),
    ],
    input = roomOf(snaps, points, [2, 3, 4, 5], true),
    views = asViews(snaps),
    solution = solveRoom(input);
  return { views, input, solution };
}
/** A parsed file's views as the room holds them, and its numbers again. */
function reopened(file: RoomFile) {
  dropFrames();
  const views = asViews(
      file.views.map(({ id, label, picture, ...snap }) => {
        void [id, label, picture];
        return snap;
      }),
    ),
    solution = solveRoom(
      roomOf(
        views.map((v) => v.snap),
        file.points.map((p) => ({ id: p.id, seen: [...p.obs] })),
        file.outline,
        file.closed,
      ),
    );
  return derivedNumbers(views, solution, file.closed, file.unit);
}
const saveAndParse = (pictures = new Map<number, string>()) => {
  const { views, input, solution } = marked(),
    file = roomFile(
      views,
      input,
      solution,
      "m",
      pictures,
      "2026-10-10T12:00:00.000Z",
    ),
    parsed = parseRoomFile(JSON.stringify(file, null, 1));
  if (!parsed.ok) throw new Error(parsed.problem);
  return { file, parsed: parsed.file, views };
};

describe("a room file", () => {
  it("round-trips: every tap comes back and every number worked out again equals the saved one", () => {
    const { file, parsed, views } = saveAndParse();
    expect(file.app).toBe("spectra-room");
    expect(file.version).toBe(1);
    expect(file.reference).toEqual({ label: "Custom", long: 1000, short: 700 });
    expect(
      parsed.views.map(({ id, label, ...snap }) => ({ id, label, snap })),
    ).toEqual(views.map((v) => ({ id: v.id, label: v.label, snap: v.snap })));
    expect(parsed.points).toEqual(file.points);
    expect(parsed.outline).toEqual([2, 3, 4, 5]);
    expect(parsed.closed).toBe(true);
    // The numbers a person reads in the file.
    const names = file.numbers.map((n) => n.name);
    expect(names).toEqual([
      "room floor area",
      "room perimeter",
      "room wall 1",
      "room wall 2",
      "room wall 3",
      "room wall 4",
      "picture 2 span 1",
      "picture 2 area 1 perimeter",
      "picture 2 area 1 area",
    ]);
    const area = file.numbers[0];
    expect(area.value).toBeCloseTo(AREA_MM2 / 1e6, 4);
    expect(area.error).toBeGreaterThan(0);
    expect(area.unit).toBe("m²");
    expect(area.pictures).toEqual([1, 2, 3, 4]);
    expect(area.text).toMatch(/^13\.0\d* ± 0\.\d+ m²$/);
    expect(area.basis).toContain("Rests on 4 pictures");
    expect(file.numbers[6].pictures).toEqual([2]);
    // Worked out again from the parsed taps: the same, to the last digit.
    const again = reopened(parsed);
    expect(numbersThatDiffer(parsed.numbers, again)).toEqual([]);
    expect(again.map((n) => [n.name, n.value, n.error, n.unit])).toEqual(
      file.numbers.map((n) => [n.name, n.value, n.error, n.unit]),
    );
  });

  it("says which numbers differ when the file's taps and its numbers do not agree", () => {
    const { parsed } = saveAndParse(),
      tampered: RoomFile = {
        ...parsed,
        // Corner 3 of the room, in picture 1, moved 40 pixels.
        points: parsed.points.map((p) =>
          p.id === 4
            ? {
                ...p,
                obs: p.obs.map((o, i) =>
                  i ? o : { ...o, at: { ...o.at, x: o.at.x + 40 } },
                ),
              }
            : p,
        ),
      },
      differ = numbersThatDiffer(parsed.numbers, reopened(tampered));
    expect(differ.length).toBeGreaterThanOrEqual(4);
    expect(differ.some((d) => d.startsWith("room floor area: saved as "))).toBe(
      true,
    );
    expect(differ.some((d) => d.startsWith("room wall 2: saved as "))).toBe(
      true,
    );
    // The numbers that do not rest on that corner are not listed.
    expect(differ.some((d) => d.startsWith("picture 2 span 1"))).toBe(false);
    expect(differ.some((d) => d.startsWith("room wall 4"))).toBe(false);
    // A saved number edited by hand is caught the same way, with both values.
    const edited = parsed.numbers.map((n, i) =>
        i === 2 ? { ...n, value: n.value + 0.001 } : n,
      ),
      one = numbersThatDiffer(edited, reopened(parsed));
    expect(one).toHaveLength(1);
    expect(one[0]).toMatch(
      /^room wall 1: saved as 4\.201\d* ± .* m, now 4\.2\d* ± .* m$/,
    );
    // One part in a million is rounding, not a difference.
    const rounded = parsed.numbers.map((n) => ({
      ...n,
      value: n.value * (1 + 1e-9),
    }));
    expect(numbersThatDiffer(rounded, reopened(parsed))).toEqual([]);
  });

  it("holds the pictures only when asked, and says when it does not", () => {
    const without = saveAndParse();
    expect(without.file.views.every((v) => !("picture" in v))).toBe(true);
    expect(without.file.note).toContain("The pictures are not in this file.");
    expect(without.parsed.views.every((v) => v.picture === undefined)).toBe(
      true,
    );
    const withTwo = saveAndParse(
      new Map([
        [1, PNG],
        [3, PNG],
      ]),
    );
    expect(withTwo.parsed.views.map((v) => v.picture)).toEqual([
      PNG,
      undefined,
      PNG,
      undefined,
    ]);
    expect(withTwo.file.note).not.toContain("not in this file");
  });

  it("carries 60 random pictures' states through a file with every field intact", () => {
    const { snap } = randomSnaps(31, W, H);
    for (let i = 0; i < 20; i++) {
      const snaps = [snap(), snap(), snap()],
        views = asViews(snaps),
        input = roomOf(snaps, [], [], false),
        file = roomFile(views, input, solveRoom(input), "cm", new Map(), "now"),
        parsed = parseRoomFile(JSON.stringify(file));
      if (!parsed.ok) throw new Error(parsed.problem);
      expect(
        parsed.file.views.map(({ id, label, ...s }) => (void [id, label], s)),
      ).toEqual(snaps);
    }
  });
});

describe("refusing a file", () => {
  const good = () =>
      JSON.parse(JSON.stringify(saveAndParse().file)) as Record<
        string,
        unknown
      > &
        RoomFile,
    problem = (v: unknown) => {
      const p = parseRoomFile(typeof v === "string" ? v : JSON.stringify(v));
      return p.ok ? "opened" : p.problem;
    };

  it("refuses a version it does not know, in words", () => {
    expect(problem({ ...good(), version: 99 })).toBe(
      "This room file is version 99. This SPECTRA reads version 1 only, so it was not opened.",
    );
    expect(problem({ ...good(), version: "1" })).toContain("version unknown");
    expect(problem(good())).toBe("opened");
  });

  it("refuses what is not a room file", () => {
    expect(problem("<html><script>alert(1)</script></html>")).toBe(
      "This is not a room file: it could not be read as JSON.",
    );
    expect(problem("")).toContain("could not be read as JSON");
    expect(problem({ app: "something-else", version: 1 })).toBe(
      "This is not a room file saved by SPECTRA's Save room.",
    );
    expect(problem("[1, 2]")).toContain("not a room file saved by");
    expect(problem("null")).toContain("not a room file saved by");
    expect(problem(" ".repeat(MAX_FILE_BYTES + 1))).toContain(
      "larger than 60 MB",
    );
  });

  it("refuses a damaged file and names the part", () => {
    const cut = (edit: (f: RoomFile & Record<string, unknown>) => void) => {
      const f = good();
      edit(f);
      return problem(f);
    };
    expect(cut((f) => delete (f as Partial<RoomFile>).views)).toContain(
      "its pictures is missing or not as it should be",
    );
    expect(
      cut((f) => (f.views[1].ruler.corners[0].x = "12" as unknown as number)),
    ).toContain("picture 2, the reference corners");
    expect(
      cut((f) => (f.views[0].ruler.corners[2].y = null as unknown as number)),
    ).toContain("picture 1, the reference corners");
    expect(cut((f) => f.views[0].ruler.corners.push({ x: 1, y: 1 }))).toContain(
      "damaged",
    );
    expect(cut((f) => (f.views[2].ruler.scale = 0))).toContain("picture 3");
    expect(cut((f) => (f.views[0].box.w = -5))).toContain("picture 1");
    expect(cut((f) => (f.views[0].walls.pick = 7))).toContain(
      "picture 1, the walls",
    );
    expect(cut((f) => (f.points[0].obs[0].view = 42))).toContain(
      "a room point names a picture that is not there",
    );
    expect(cut((f) => f.outline.push(77))).toContain(
      "its outline names a point that is not there",
    );
    expect(cut((f) => (f.views[1].id = 1))).toContain(
      "two pictures share a number",
    );
    expect(cut((f) => (f.unit = "furlong" as never))).toContain("its unit");
    expect(
      cut((f) => (f.views = Array.from({ length: 25 }, () => f.views[0]))),
    ).toContain("its pictures");
  });

  it("takes a picture only as a JPEG or PNG data URL", () => {
    const withPicture = (url: unknown) => {
      const f = good();
      (f.views[0] as { picture?: unknown }).picture = url;
      return problem(f);
    };
    expect(withPicture(PNG)).toBe("opened");
    expect(withPicture("data:image/jpeg;base64,/9j/4AAQ")).toBe("opened");
    for (const bad of [
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "javascript:alert(1)",
      "https://example.com/a.png",
      'data:image/png;base64,iVBOR"><script>',
      "data:image/png,plain",
      42,
    ])
      expect(withPicture(bad), String(bad)).toContain("picture 1");
  });

  it("carries nothing in that it was not asked for", () => {
    const f = good();
    (f as Record<string, unknown>).html = "<img onerror=alert(1)>";
    (f.views[0] as Record<string, unknown>).onload = "x";
    (f.views[0].ruler as Record<string, unknown>).tool = "edge";
    (f.points[0] as Record<string, unknown>).extra = 1;
    const p = parseRoomFile(JSON.stringify(f));
    if (!p.ok) throw new Error(p.problem);
    expect(Object.keys(p.file).sort()).toEqual(
      Object.keys(saveAndParse().file).sort(),
    );
    expect("onload" in p.file.views[0]).toBe(false);
    expect("tool" in p.file.views[0].ruler).toBe(false);
    expect("extra" in p.file.points[0]).toBe(false);
  });
});
