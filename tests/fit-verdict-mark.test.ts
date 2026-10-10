/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect } from "vitest";
import { verdictOf, type Row } from "../src/panels/ruler/fit/verdict";
import {
  COLOR,
  headline,
  MARK,
  tagText,
  WORD,
} from "../src/panels/ruler/fit/verdict-mark";

const row = (label: string, ...mm: number[]): Row => ({
  label,
  verdicts: mm.map((v) => verdictOf("outline", v, 20, "cm", "b")),
  reason: null,
  warnings: [],
});

describe("the verdict mark", () => {
  it("gives each verdict its own mark, word and colour", () => {
    expect(MARK).toEqual({ fits: "✓", over: "×", close: "~" });
    for (const set of [MARK, WORD, COLOR])
      expect(new Set(Object.values(set)).size).toBe(3);
    // The word in the mark is the one the sentence beside it starts with.
    for (const mm of [150, -150, 5]) {
      const v = verdictOf("outline", mm, 20, "cm", "b");
      expect(v.text.startsWith(WORD[v.kind]), v.text).toBe(true);
    }
  });
  it("shows the worst verdict on the stage", () => {
    expect(headline([])).toBeNull();
    expect(headline([row("Area 1")])).toBeNull();
    expect(headline([row("Area 1", 150)])).toEqual({
      kind: "fits",
      label: "Area 1",
      of: 1,
    });
    expect(
      headline([row("Area 1", 150), row("Measurement 1", 5, 150)]),
    ).toEqual({ kind: "close", label: "Measurement 1", of: 3 });
    expect(
      headline([row("Area 1", 150), row("Area 2", -150), row("Area 3", 5)])!
        .kind,
    ).toBe("over");
  });
  it("words the stage tag with the mark first, naming the check when there are several", () => {
    expect(tagText({ kind: "fits", label: "Area 1", of: 1 })).toBe("✓ Fits");
    expect(tagText({ kind: "over", label: "Area 2", of: 3 })).toBe(
      "× Does not fit (Area 2)",
    );
    expect(tagText({ kind: "close", label: "Area 1", of: 1 })).toBe(
      "~ Too close to call",
    );
  });
});
