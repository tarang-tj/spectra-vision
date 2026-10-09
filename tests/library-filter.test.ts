/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { describe, it, expect, beforeEach } from "vitest";
import {
  filterSummary,
  getFilter,
  isFiltering,
  onFilterChange,
  resetFilter,
  setFilterMode,
  shows,
  toggleFilterLabel,
} from "../src/modes/lib/object-filter";

describe("the Objects class filter", () => {
  beforeEach(resetFilter);
  it("shows everything until a mode and at least one class are chosen", () => {
    expect(isFiltering()).toBe(false);
    expect(shows("chair")).toBe(true);
    setFilterMode("only");
    // "Only these" with nothing ticked must not blank the stage.
    expect(isFiltering()).toBe(false);
    expect(shows("chair")).toBe(true);
    expect(filterSummary()).toBe("");
  });
  it("only: shows just the chosen classes", () => {
    setFilterMode("only");
    toggleFilterLabel("chair");
    toggleFilterLabel("person");
    expect(shows("chair")).toBe(true);
    expect(shows("cup")).toBe(false);
    expect(filterSummary()).toBe("Filter on: showing only chair, person");
  });
  it("hide: shows all but the chosen classes, and says so", () => {
    setFilterMode("hide");
    toggleFilterLabel("chair");
    expect(shows("chair")).toBe(false);
    expect(shows("person")).toBe(true);
    expect(filterSummary()).toBe("Filter on: hiding chair");
    ["a", "b", "c"].forEach(toggleFilterLabel);
    expect(filterSummary()).toBe("Filter on: hiding 4 classes");
  });
  it("toggling twice un-chooses, and reset clears mode and classes in one go", () => {
    setFilterMode("hide");
    toggleFilterLabel("chair");
    toggleFilterLabel("chair");
    expect(getFilter().labels).toEqual([]);
    toggleFilterLabel("cup");
    resetFilter();
    expect(getFilter()).toEqual({ mode: "off", labels: [] });
    expect(shows("cup")).toBe(true);
  });
  it("changes the snapshot object and tells listeners only on a real change", () => {
    let calls = 0;
    const off = onFilterChange(() => calls++),
      first = getFilter();
    setFilterMode("off");
    resetFilter();
    expect(calls).toBe(0);
    setFilterMode("hide");
    expect(getFilter()).not.toBe(first);
    expect(calls).toBe(1);
    off();
    toggleFilterLabel("x");
    expect(calls).toBe(1);
  });
});
