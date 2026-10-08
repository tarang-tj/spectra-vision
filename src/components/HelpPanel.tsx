/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { modes } from "../modes";
import { SHORTCUTS } from "../shell/shortcuts";

/** Privacy, limits, recovery and the keyboard shortcuts. The privacy
 * paragraph is a promise: change it only together with the behaviour. */
export default function HelpPanel() {
  return (
    <section className="help" id="help">
      <h2>Your view stays yours.</h2>
      <p>
        Camera frames and local files are processed in this browser. There is no
        image upload service, account, analytics, or face identification. Model
        files load from this site. Screenshots and JSON exports download only
        when you request them. To open offline, the browser keeps a copy of the
        app and of each model you have used on this device; clear this site’s
        data in your browser settings to remove them.
      </p>
      <p>
        {modes.length} modes are available:{" "}
        {modes.map((m) => m.label).join(", ")}. Each loads its model the first
        time you open it. Objects detects common COCO categories; Body tracks
        one person; Hands tracks up to two hands. Pinching is a geometric
        thumb–index distance heuristic. Motion map shows image position, not
        physical distance. Confidence is a model threshold, not a guarantee of
        accuracy.
      </p>
      <p>
        Use HTTPS or localhost for camera access. Start with good light; keep
        your full body visible in Body mode and your fingers unobstructed in
        Hands. Video uploads loop and are muted. Pause stops inference; Stop
        camera releases the camera. Demo images are still photos with real model
        inference. Motion demos pan those photos; Constellation isolates the
        tracking geometry. Record saves up to 30 seconds of canvas video locally
        and stops when source or mode changes. For best results use a current
        Chrome or Edge browser.
      </p>
      <h3>Keyboard</h3>
      <dl className="shortcut-list">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.keys}>
            <dt>
              <kbd>{shortcut.keys}</kbd>
            </dt>
            <dd>{shortcut.does}</dd>
          </div>
        ))}
      </dl>
      <a
        href="https://github.com/tarang-tj/spectra-vision/blob/main/THIRD_PARTY_NOTICES.md"
        target="_blank"
        rel="noreferrer"
      >
        Third-party notices
      </a>
    </section>
  );
}
