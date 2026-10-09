/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Which classes Objects shows. "only": just the chosen ones. "hide": all but
// the chosen ones. Applies to the drawn boxes and the inspector rows; the
// models, the Library counts and the session export still see every
// detection. Kept for this page session only, so a reload always clears it.
export type FilterMode = "off" | "only" | "hide";
export type ObjectFilter = {
  mode: FilterMode;
  labels: readonly string[];
};

let state: ObjectFilter = { mode: "off", labels: [] };
const listeners = new Set<() => void>();
const set = (next: ObjectFilter) => {
  state = next;
  for (const listener of [...listeners]) listener();
};

/** The current filter. A new object on every change, so it can be a store snapshot. */
export const getFilter = (): ObjectFilter => state;
export const onFilterChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setFilterMode(mode: FilterMode) {
  if (mode !== state.mode) set({ ...state, mode });
}
export function toggleFilterLabel(label: string) {
  const has = state.labels.includes(label);
  set({
    ...state,
    labels: has
      ? state.labels.filter((entry) => entry !== label)
      : [...state.labels, label],
  });
}
export const resetFilter = () => {
  if (state.mode !== "off" || state.labels.length)
    set({ mode: "off", labels: [] });
};

/** Whether the filter changes what is shown: a mode other than off with at
 * least one class chosen. "Only these" with nothing chosen shows everything,
 * rather than nothing, so a half-set filter never blanks the stage. */
export const isFiltering = (filter: ObjectFilter = state): boolean =>
  filter.mode !== "off" && filter.labels.length > 0;
/** Whether a detector label is shown under the filter. */
export function shows(label: string, filter: ObjectFilter = state): boolean {
  if (!isFiltering(filter)) return true;
  const chosen = filter.labels.includes(label);
  return filter.mode === "only" ? chosen : !chosen;
}
/** One plain sentence for the stage and the panel, or "" when not filtering. */
export function filterSummary(filter: ObjectFilter = state): string {
  if (!isFiltering(filter)) return "";
  const n = filter.labels.length,
    names = n <= 3 ? filter.labels.join(", ") : `${n} classes`;
  return filter.mode === "only"
    ? `Filter on: showing only ${names}`
    : `Filter on: hiding ${names}`;
}
