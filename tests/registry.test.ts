import { describe, it, expect } from "vitest";
import { collect } from "../src/registry";
import { isMode, modes, modeProblems, tasksOf, getMode } from "../src/modes";
import { isEffect, effects, effectProblems, effectsFor } from "../src/effects";
import { isPanel, panels, panelProblems } from "../src/panels";

// The same call each registry makes, pointed at fixture folders: a file that
// exists in the folder is an entry, with no list to keep in sync.
describe("registry discovery from a folder", () => {
  it("finds mode files, sorts them, and reports invalid and duplicate ones", () => {
    const found = collect(
      import.meta.glob("./fixtures/modes/*.ts", { eager: true }),
      isMode,
      "mode",
    );
    expect(found.items.map((m) => m.id)).toEqual(["sample-mode", "later-mode"]);
    expect(found.problems).toHaveLength(2);
    expect(found.problems.join("\n")).toMatch(
      /broken-mode\.ts.*not a valid mode/,
    );
    expect(found.problems.join("\n")).toMatch(
      /twin-mode\.ts.*"sample-mode" is already used/,
    );
    expect(tasksOf(found.items[0]).map((t) => t.kind)).toEqual([
      "pose",
      "hand",
    ]);
    expect(tasksOf(found.items[1])).toHaveLength(1);
  });
  it("finds an effect and a panel fixture", () => {
    const effect = collect(
        import.meta.glob("./fixtures/effects/*.ts", { eager: true }),
        isEffect,
        "effect",
      ),
      panel = collect(
        import.meta.glob("./fixtures/panels/*.tsx", { eager: true }),
        isPanel,
        "panel",
      );
    expect(effect.items.map((e) => e.id)).toEqual(["sample-effect"]);
    expect(panel.items.map((p) => p.id)).toEqual(["sample-panel"]);
    expect([...effect.problems, ...panel.problems]).toEqual([]);
  });
  it("rejects a definition of the wrong kind", () => {
    const wrong = collect(
      import.meta.glob("./fixtures/effects/*.ts", { eager: true }),
      isMode,
      "mode",
    );
    expect(wrong.items).toEqual([]);
    expect(wrong.problems).toHaveLength(1);
  });
});

describe("the shipped registries", () => {
  it("contain no skipped or duplicate plugin files", () => {
    expect([...modeProblems, ...effectProblems, ...panelProblems]).toEqual([]);
  });
  it("still start with the three v1 modes in their v1 order", () => {
    expect(modes.slice(0, 3).map((m) => [m.id, m.short, m.label])).toEqual([
      ["objects", "Objects", "Object detection"],
      ["body", "Body", "Body tracking"],
      ["hands", "Hands", "Hand tracking"],
    ]);
    expect(modes.slice(0, 3).map((m) => tasksOf(m)[0].kind)).toEqual([
      "object",
      "pose",
      "hand",
    ]);
    expect(getMode("no-such-mode").id).toBe("objects");
  });
  it("offer Trails then Constellation in every v1 mode, Trails on by default", () => {
    for (const mode of ["objects", "body", "hands"])
      expect(
        effectsFor(mode)
          .slice(0, 2)
          .map((e) => [e.id, e.label, !!e.defaultOn]),
      ).toEqual([
        ["trails", "Trails", true],
        ["constellation", "Constellation", false],
      ]);
    expect(effects.every((e) => e.kind === "2d" || e.kind === "gl")).toBe(true);
  });
  it("offer Trails only in the modes that give it something to follow", () => {
    const withTrails = modes
      .filter((m) => effectsFor(m.id).some((e) => e.id === "trails"))
      .map((m) => m.id);
    expect(withTrails).toEqual(["objects", "body", "hands", "fusion"]);
    // Constellation draws its sky in every mode.
    for (const m of modes)
      expect(effectsFor(m.id).some((e) => e.id === "constellation")).toBe(true);
  });
  it("list Inspect as the first panel, then the Lab, then the measuring panels", () => {
    expect(panels.map((p) => p.id)).toEqual([
      "inspect",
      "lab",
      "presence",
      "ruler",
    ]);
  });
});
