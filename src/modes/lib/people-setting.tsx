/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import { MAX_PEOPLE, getPeople, onPeopleChange, setPeople } from "./people";

const COUNTS = Array.from({ length: MAX_PEOPLE }, (_, i) => i + 1);

/** Body mode's People setting: the most people it follows. It is a ceiling,
 * not a count: with fewer people in view it shows fewer. */
export default function PeopleSetting() {
  const people = useSyncExternalStore(onPeopleChange, getPeople);
  return (
    <div className="measure-settings">
      <div role="group" aria-label="People">
        {COUNTS.map((count) => (
          <button
            key={count}
            className="button compact"
            aria-pressed={people === count}
            aria-label={`Follow up to ${count} ${count === 1 ? "person" : "people"}`}
            onClick={() => setPeople(count)}
          >
            {count}
          </button>
        ))}
      </div>
      <p>
        The most people Body follows. More people take more time per frame, and
        people who overlap or are far away can be missed.
      </p>
    </div>
  );
}
