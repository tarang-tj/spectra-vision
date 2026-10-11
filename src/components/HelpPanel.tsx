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
        one person by default, or up to four with its People setting; Hands
        tracks up to two hands; Face follows one face and does not identify it;
        Segment labels each pixel as background, hair, body skin, face skin,
        clothes or accessories; Gestures recognizes seven hand gestures; Fusion
        runs the body, hand and face models together; Depth maps relative depth
        from one camera, with a 3D view, and its first load is over 100 MB.
        Depth gives no lengths unless a floor marked in the Ruler on a still
        photo lets it be scaled. Pinching is a geometric thumb–index distance
        heuristic. Motion map shows image position, not physical distance.
        Confidence is a model threshold, not a guarantee of accuracy; both are
        shown only in modes that find things at places in the picture. The Ruler
        tab measures one flat surface in a frozen picture from a reference of
        known size, with an error bar on every number. Its Box tool stands a box
        of real size on the floor and says whether it fits, does not fit or is
        too close to call; its Walls tool turns floor corners and ceiling points
        into wall lengths, heights, areas and a volume, with a 3D preview and
        OBJ and CSV files; More known sizes adds further references and
        tape-measured spans, and the tape test checks a reading against a tape.
        The Ruler can also hold several still pictures of one room: each keeps
        its own taps, a later picture joins the plan through a point marked in
        it and in a picture already on the plan, and it is refused in words when
        the pictures disagree. Its Room tool outlines the room from corners seen
        in different pictures, with wall lengths, perimeter and floor area, a
        merged plan to save as SVG and CSV, and a room file to save and open
        again. The bars cover tap placement, not lens distortion. Several
        pictures of one room have been checked on synthetic pictures only, and
        none of the Ruler has been checked against a tape measure in a real
        room.
      </p>
      <p>
        Use HTTPS or localhost for camera access. Start with good light; keep
        your full body visible in Body mode and your fingers unobstructed in
        Hands. Video uploads loop and are muted. Pause stops inference; Stop
        camera releases the camera. Demo images are still photos with real model
        inference. A still picture is not inferred continuously: it is checked
        about once a second, and once in Depth, and the frame-rate readout says
        so. Motion demos pan those photos; Constellation isolates the tracking
        geometry. Record saves up to 30 seconds of canvas video locally and
        stops when source or mode changes. For best results use a current Chrome
        or Edge browser. If a panel stops on an error, it shows a message and a
        Try again button while the stage and the rest of the app keep working.
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
