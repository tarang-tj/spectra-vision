/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import {
  FINER_FLOOR,
  FINER_PER_PASS,
  finerOn,
  onFinerChange,
  setFiner,
} from "./finer";

/** The Finer names switch with what it does and what it costs, stated plainly.
 * Used by Objects' controls and by the Library panel. */
export default function FinerSetting() {
  const on = useSyncExternalStore(onFinerChange, finerOn);
  return (
    <div className="measure-settings">
      <button
        className="button compact"
        aria-pressed={on}
        onClick={() => setFiner(!on)}
      >
        Finer names
      </button>
      <p>
        Names each box again with a second model that knows about 1,000 kinds of
        thing, shown beside the detector&apos;s label with its own score. A
        finer name is shown only at {Math.round(FINER_FLOOR * 100)}% or more. At
        most {FINER_PER_PASS} boxes are checked per frame and each about once a
        second. Each box checked adds time to its frame. Downloads a 5.4 MB
        model the first time it is on.
      </p>
    </div>
  );
}
