/** Shared discovery for the plugin registries (modes, effects, panels).
 * Each registry passes the result of an eager `import.meta.glob` here, so that
 * adding one file to its folder adds one entry and nothing else is edited. */
export type Collected<T> = { items: T[]; problems: string[] };

export function collect<T extends { id: string; order?: number }>(
  modules: Record<string, unknown>,
  isValid: (value: unknown) => value is T,
  kind: string,
): Collected<T> {
  const items: T[] = [],
    problems: string[] = [],
    seen = new Map<string, string>();
  // Sorted paths make the result independent of the bundler's module order.
  for (const path of Object.keys(modules).sort()) {
    const value = (modules[path] as { default?: unknown } | null)?.default;
    if (!isValid(value)) {
      problems.push(`${path}: the default export is not a valid ${kind}.`);
      continue;
    }
    const first = seen.get(value.id);
    if (first) {
      problems.push(
        `${path}: ${kind} id "${value.id}" is already used by ${first}.`,
      );
      continue;
    }
    seen.set(value.id, path);
    items.push(value);
  }
  items.sort(
    (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.id.localeCompare(b.id),
  );
  return { items, problems };
}

/** A broken plugin is skipped, not fatal, but it must never be silent. */
export function report(problems: string[]) {
  for (const problem of problems) console.warn(`[spectra registry] ${problem}`);
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
