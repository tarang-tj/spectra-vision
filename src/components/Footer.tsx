import { CircleHelp, Download, X } from "lucide-react";
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
            {fps === null ? "—" : fps.toFixed(1)} <small>fps</small>
          </strong>
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
          Objects <i>·</i> Body <i>·</i> Hands
        </span>
        <div>
          <span>No account. No uploads.</span>
          <button
            className="icon-button"
            aria-label={help ? "Close help" : "About privacy and controls"}
            aria-expanded={help}
            onClick={onHelp}
          >
            {help ? <X size={21} /> : <CircleHelp size={21} />}
          </button>
        </div>
      </footer>
      {help && (
        <section className="help">
          <h2>Your view stays yours.</h2>
          <p>
            Camera frames and local files are processed in this browser. There
            is no image upload service, account, analytics, or face
            identification. Model files load from this site. Screenshots and
            JSON exports download only when you request them.
          </p>
          <p>
            Objects detects common COCO categories; Body tracks one person;
            Hands tracks up to two hands. Pinching is a geometric thumb–index
            distance heuristic. Motion map shows image position, not physical
            distance. Confidence is a model threshold, not a guarantee of
            accuracy.
          </p>
          <p>
            Use HTTPS or localhost for camera access. Start with good light;
            keep your full body visible in Body mode and your fingers
            unobstructed in Hands. Video uploads loop and are muted. Pause stops
            inference; Stop camera releases the camera. Demo images are still
            photos with real model inference. For best results use a current
            Chrome or Edge browser.
          </p>
          <a
            href="https://github.com/tarang-tj/spectra-vision/blob/main/THIRD_PARTY_NOTICES.md"
            target="_blank"
            rel="noreferrer"
          >
            Third-party notices
          </a>
        </section>
      )}
    </>
  );
}
