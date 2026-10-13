/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useSyncExternalStore } from "react";
import { plumbVersion, subscribePlumbs } from "../../panels/ruler/plumbs";
import { useRuler } from "../../panels/ruler/state";
import {
  acceptDownload,
  consentVersion,
  consentWords,
  onConsent,
} from "../../shell/download-consent";
import { useStudio } from "../../studio-context";
import { onDemandState, onOnDemandState } from "../../vision/on-demand";
import { DEPTH_MODEL, depthTask } from "./depth-task";
import {
  measureOn,
  measureWanted,
  onMeasureChange,
  setMeasure,
} from "./object-measure";
import {
  latestMeasured,
  measureStatus,
  onMeasured,
} from "./object-measure-frame";
import { NO_SELECTION, detailOf, libraryLine } from "./object-measure-text";
import "./object-measure.css";

/** The Measure objects switch with what it does, what it needs and what it
 * costs, then where it stands, then what the selected box's numbers rest on.
 * Used by Objects' controls; the Library shows the `compact` one, which
 * leaves the per-box detail to Inspect. */
export default function ObjectMeasureSetting({
  compact = false,
}: {
  compact?: boolean;
}) {
  const on = useSyncExternalStore(onMeasureChange, measureOn),
    { frame, mode } = useStudio();
  // The status follows the Ruler, the depth task and the latest readings.
  useRuler();
  useSyncExternalStore(subscribePlumbs, plumbVersion);
  useSyncExternalStore(onOnDemandState, () => onDemandState("depth"));
  useSyncExternalStore(onConsent, consentVersion);
  const latest = useSyncExternalStore(onMeasured, latestMeasured),
    // Only Objects measures: in another mode there is nothing to report.
    status = mode.id === "objects" ? measureStatus(frame.source) : null,
    ready = status?.state === "ready",
    // Where touch is the main way in, the 99 MB model waits for a yes
    // (shell/download-consent.ts), asked once the Ruler is ready.
    wanted = status ? measureWanted(frame.source) : null,
    asking = !!wanted && !wanted.wanted && wanted.why === "consent",
    selected =
      ready && latest?.measurement.metric
        ? latest.measurement.boxes.find(
            (box) => box.id === frame.settings.selected,
          )
        : undefined;
  return (
    <div className="measure-settings object-measure">
      <button
        className="button compact"
        aria-pressed={on}
        onClick={() => setMeasure(!on)}
      >
        Measure objects
      </button>
      <p>
        Gives each box a distance from the camera and a box size in metres, each
        with an error bar. Photos only. It needs the Ruler first: a reference
        lying on the floor and a patch of floor outlined from near to far. Runs
        a second model, Depth Anything V2 Small, once per photo. That model is a
        99 MB download the first time (113 to 126 MB with its runtime), fetched
        only once the Ruler is ready.
      </p>
      {status && status.state !== "off" && (
        <p role="status" data-testid="measure-status" data-state={status.state}>
          {status.text}
        </p>
      )}
      {asking && (
        <button
          className="button compact"
          data-testid="measure-download"
          onClick={() => acceptDownload(DEPTH_MODEL)}
        >
          {consentWords("", Number(depthTask.options.bytes), false).accept}
        </button>
      )}
      {ready && compact && (
        <p role="status" data-testid="library-measured">
          {libraryLine(status.measured ?? 0, status.boxes ?? 0)}
        </p>
      )}
      {ready && !compact && (
        <div className="measure-detail" data-testid="measure-detail">
          {selected ? (
            detailOf(selected).map((text) => <p key={text}>{text}</p>)
          ) : (
            <p>{NO_SELECTION}</p>
          )}
        </div>
      )}
    </div>
  );
}
