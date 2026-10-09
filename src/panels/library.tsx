/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useState, useSyncExternalStore } from "react";
import FinerSetting from "../modes/lib/finer-setting";
import {
  filterSummary,
  getFilter,
  onFilterChange,
  resetFilter,
  setFilterMode,
  toggleFilterLabel,
} from "../modes/lib/object-filter";
import type { FilterMode } from "../modes/lib/object-filter";
import { useStudio } from "../studio-context";
import ClassList from "./library/class-list";
import {
  CLASSIFIER_LABELS,
  CLASSIFIER_SOURCE,
  DETECTOR_LABELS,
  DETECTOR_SOURCE,
  matching,
} from "./library/labels";
import {
  classifierState,
  onSeenChange,
  seenDetector,
  seenFiner,
  seenVersion,
} from "./library/seen";
import type { PanelDef } from "./types";
import "./library/library.css";

const CHOICES: { id: FilterMode; label: string }[] = [
  { id: "off", label: "Show all" },
  { id: "only", label: "Only these" },
  { id: "hide", label: "Hide these" },
];

/** Every name the Objects models can give, how often each was seen this
 * session, and a filter for which classes Objects shows. */
function Library() {
  const { mode } = useStudio(),
    [query, setQuery] = useState("");
  useSyncExternalStore(onSeenChange, seenVersion);
  const filter = useSyncExternalStore(onFilterChange, getFilter),
    summary = filterSummary(filter),
    classifier = classifierState(),
    detector = matching(DETECTOR_LABELS, query);
  return (
    <div className="library-panel">
      <h2>Library</h2>
      <p className="library-note">
        The names the Objects models can give. Counts are frames this page
        session, kept in this browser only.
      </p>
      {mode.id !== "objects" && (
        <p className="library-note" role="status">
          Switch to Objects to count and filter. Library reads that mode.
        </p>
      )}
      <section className="library-block" aria-label="Filter">
        <h3>Which classes Objects shows</h3>
        <div role="group" aria-label="Filter mode" className="library-modes">
          {CHOICES.map((choice) => (
            <button
              key={choice.id}
              className="button compact"
              aria-pressed={filter.mode === choice.id}
              onClick={() => setFilterMode(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <p className="library-note" role="status" data-testid="library-filter">
          {summary ||
            (filter.mode === "off"
              ? "Showing every class."
              : "Tick classes below to apply the filter.")}
        </p>
        {(filter.mode !== "off" || filter.labels.length > 0) && (
          <button className="button compact" onClick={resetFilter}>
            Reset filter
          </button>
        )}
      </section>
      <FinerSetting />
      {classifier && (
        <p className="library-note" role="status" data-testid="library-finer">
          {classifier.state === "ready"
            ? classifier.named
              ? `Finer names: ${classifier.named} of ${classifier.boxes} boxes in the latest frame have a name at ${Math.round(classifier.floor * 100)}% or more.`
              : `Finer names: no box in the latest frame has a name at ${Math.round(classifier.floor * 100)}% or more.`
            : classifier.state === "loading"
              ? "Finer names: loading the classifier."
              : `Finer names failed: ${classifier.note}`}
        </p>
      )}
      <label className="library-search">
        <span>Search classes</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <ClassList
        title="Detector classes"
        labels={detector}
        limit={detector.length}
        seen={seenDetector}
        chosen={filter.labels}
        onToggle={toggleFilterLabel}
      />
      <p className="library-note">From {DETECTOR_SOURCE}.</p>
      {classifier?.state === "ready" ? (
        <>
          <ClassList
            title="Finer names"
            labels={matching(CLASSIFIER_LABELS, query)}
            limit={60}
            seen={seenFiner}
          />
          <p className="library-note">
            From {CLASSIFIER_SOURCE}. Finer names are shown beside a box and are
            not filtered.
          </p>
        </>
      ) : (
        <p className="library-note">
          Turn on Finer names to load the classifier and list its{" "}
          {CLASSIFIER_LABELS.length.toLocaleString("en-US")} names.
        </p>
      )}
    </div>
  );
}

const library: PanelDef = {
  id: "library",
  label: "Library",
  order: 35,
  Component: Library,
};
export default library;
