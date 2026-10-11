import { Fragment, useSyncExternalStore } from "react";
import { CircleHelp, Download, X } from "lucide-react";
import { modes } from "../modes";
import { onStillState, stillState, stillWords } from "../vision/still";
import HelpPanel from "./HelpPanel";
export default function Footer({
  latency,
  fps,
  count,
  onExport,
  onHelp,
  help,
}: {
  latency: number | null;
  fps: number | null;
  count: number;
  onExport: () => void;
  onHelp: () => void;
  help: boolean;
}) {
  // A still picture is not inferred at a steady rate (vision/still.ts): the
  // readout then says so in words, never a rate nobody is measuring. A paused
  // stage keeps its own reading.
  const still = stillWords(useSyncExternalStore(onStillState, stillState)),
    resting = fps !== 0 && !!still.value;
  return (
    <>
      <section className="metrics" aria-label="Measured session performance">
        <div className="stat">
          <span>Inference</span>
          <strong data-testid="latency">
            {latency === null ? "—" : latency.toFixed(0)} <small>ms</small>
          </strong>
        </div>
        <div className="stat">
          <span>Frame rate</span>
          <strong data-testid="fps">
            {resting ? (
              still.value
            ) : (
              <>
                {fps === null ? "—" : fps.toFixed(1)} <small>fps</small>
              </>
            )}
          </strong>
          {fps !== 0 && still.note && (
            <span data-testid="fps-note">{still.note}</span>
          )}
        </div>
        <div className="stat">
          <span>Tracked</span>
          <strong data-testid="tracked">{count}</strong>
        </div>
        <button className="button compact export" onClick={onExport}>
          <Download size={19} />
          Export session
        </button>
      </section>
      <footer>
        <span>
          {/* The registered modes, so the line is true for any number of them. */}
          {modes.map((mode) => (
            <Fragment key={mode.id}>
              {mode.short} <i>·</i>{" "}
            </Fragment>
          ))}
          <a href={`${import.meta.env.BASE_URL}demo/`}>Watch demo</a>
        </span>
        <div>
          <span>No account. No uploads.</span>
          <button
            className="icon-button"
            aria-label={help ? "Close help" : "About privacy and controls"}
            aria-expanded={help}
            aria-controls="help"
            aria-keyshortcuts="?"
            onClick={onHelp}
          >
            {help ? <X size={21} /> : <CircleHelp size={21} />}
          </button>
        </div>
      </footer>
      {help && <HelpPanel />}
    </>
  );
}
