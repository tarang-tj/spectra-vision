/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { Seen } from "./seen";

const time = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour12: false });

/** How many frames a name was in and when it was last in one. */
export const seenText = (seen: Seen | undefined) =>
  seen ? `${seen.count} frames, last ${time(seen.last)}` : "not seen";

type Props = {
  title: string;
  labels: readonly string[];
  limit: number;
  seen(label: string): Seen | undefined;
  /** Present when rows can be picked for the filter. */
  chosen?: readonly string[];
  onToggle?(label: string): void;
};

/** A list of class names with what was seen of each. Names that were seen come
 * first, then the rest in the model's own order; only `limit` rows are drawn. */
export default function ClassList({
  title,
  labels,
  limit,
  seen,
  chosen,
  onToggle,
}: Props) {
  const sorted = [...labels].sort(
      (a, b) => (seen(b)?.count ?? 0) - (seen(a)?.count ?? 0),
    ),
    shown = sorted.slice(0, limit);
  return (
    <section className="library-block" aria-label={title}>
      <h3>
        {title} <span className="count">{labels.length}</span>
      </h3>
      {labels.length === 0 && <p className="library-note">No class matches.</p>}
      <ul className="library-list">
        {shown.map((label) => {
          const s = seen(label);
          return (
            <li key={label} data-seen={s ? s.count : 0}>
              {onToggle ? (
                <label>
                  <input
                    type="checkbox"
                    checked={chosen?.includes(label) ?? false}
                    onChange={() => onToggle(label)}
                  />
                  <span>{label}</span>
                </label>
              ) : (
                <span className="library-name">{label}</span>
              )}
              <small>{seenText(s)}</small>
            </li>
          );
        })}
      </ul>
      {labels.length > shown.length && (
        <p className="library-note">
          {labels.length - shown.length} more. Search to narrow the list.
        </p>
      )}
    </section>
  );
}
