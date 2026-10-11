/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useSyncExternalStore } from "react";
import { useStudio } from "../../../studio-context";
import BasisDetails from "../basis-details";
import { DEFAULT_TRIALS } from "../camera-of";
import { derive } from "../derive";
import { download } from "../export-plan";
import { plumbVersion, subscribePlumbs } from "../plumbs";
import { useRuler } from "../state";
import { currentWalls } from "./current";
import { wallsCsv } from "./export-shell";
import { meshObj } from "./mesh";
import { dropGrab } from "./pointer";
import PreviewPanel from "./preview-panel";
import WallsResults from "./results";
import { closeRoom, copyOutline, pickCorner, useWalls } from "./store";
import { heightReason, heightUncertain, liveStep } from "./text";

const LIST = "walls-list";

/** The Walls part of the Ruler panel: its buttons, numbers, 3D preview and
 * export. `show` is false while the picture moves: no numbers then. */
export default function WallsSection({ show }: { show: boolean }) {
  const s = useRuler(),
    walls = useWalls(),
    { notice } = useStudio();
  // Another tool's plumb edge changes the camera, and so these numbers.
  useSyncExternalStore(subscribePlumbs, plumbVersion);
  useEffect(() => dropGrab, []);
  const count = walls.corners.length;
  if (s.tool !== "wall" && !count) return null;
  const d = derive(s),
    cur = show && count ? currentWalls(s, d, walls) : null,
    n = cur?.numbers ?? null,
    outlines = s.shapes.filter((x) => x.kind === "area" && x.done),
    outline = outlines[outlines.length - 1],
    why = n
      ? heightReason(
          n,
          walls.corners.some((c) => c.top),
          !!cur?.camera?.focalResolved,
        )
      : null,
    mesh = cur?.mesh ?? null,
    preview = cur?.preview ?? null,
    // The bar on the height is as large as the height: no walls are drawn.
    vague = !!n && heightUncertain(n),
    canSave = !!n && !!mesh && !!n.floorArea;

  function save(kind: "obj" | "csv") {
    if (!n || !mesh || !cur) return;
    try {
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      if (kind === "obj")
        download(
          `spectra-room-${stamp}.obj`,
          meshObj(
            mesh,
            `${mesh.faces.length === 1 ? "Floor only: no height was measured.\n" : ""}${cur.basis}`,
          ),
          "text/plain",
        );
      else
        download(
          `spectra-room-${stamp}.csv`,
          wallsCsv(n, s.unit, why, cur.basis),
          "text/csv",
        );
      notice("Saved to your downloads.");
    } catch {
      notice("The file could not be saved by this browser.");
    }
  }

  return (
    <section className="ruler-block" aria-label="Walls">
      <h3>Walls</h3>
      <p className="ruler-note">
        Tap the floor corners in order round the room, close it, then tap where
        each wall edge meets the ceiling. One picture only: a corner you cannot
        see cannot be measured.
      </p>
      {s.tool === "wall" && (
        <p className="ruler-step" role="status" data-testid="walls-step">
          {d.sheet
            ? show
              ? liveStep(walls)
              : "Freeze the picture, then tap on it."
            : "Tap the four reference corners first (choose Span to place them)."}
        </p>
      )}
      <div className="ruler-group" role="group" aria-label="Walls">
        <button
          className="button"
          onClick={closeRoom}
          disabled={walls.closed || count < 3}
        >
          Close room
        </button>
        <button
          className="button"
          onClick={() => outline && copyOutline(outline.pts)}
          disabled={!outline}
          title="Copy the last finished Area outline as the floor"
        >
          Use last outline
        </button>
        {walls.closed &&
          walls.corners.map((c, i) => (
            <button
              key={i}
              className="button"
              aria-pressed={walls.pick === i}
              onClick={() => pickCorner(walls.pick === i ? null : i)}
            >
              Ceiling above corner {i + 1}
              {c.top ? " (set)" : ""}
            </button>
          ))}
      </div>
      {show && count > 0 && !n && (
        <p className="ruler-warn">
          Not measured: a floor corner is at or beyond the horizon of the floor,
          or the reference is not solved. Move the corner onto the floor.
        </p>
      )}
      {n && cur && (
        <WallsResults n={n} cur={cur} unit={s.unit} why={why} listId={LIST} />
      )}
      {vague && (
        <p className="ruler-warn" data-testid="walls-no-height">
          The walls are not drawn in the 3D view, only the floor. The bar on the
          ceiling height is as large as the height itself, so walls of that
          height would be a guess. Take the picture with the camera tilted down
          at the floor so the walls run up the picture, or add a larger or
          second reference. The floor area is not affected.
        </p>
      )}
      {n && preview && (
        <PreviewPanel
          mesh={preview}
          describedBy={LIST}
          note={
            vague
              ? "Floor only: the heights are too uncertain to draw."
              : preview.faces.length === 1
                ? "Floor only: no height is measured yet."
                : null
          }
        />
      )}
      {n && cur && (
        <>
          <div className="ruler-group" role="group" aria-label="Save the room">
            <button
              className="button"
              onClick={() => save("obj")}
              disabled={!canSave}
            >
              Save OBJ
            </button>
            <button className="button" onClick={() => save("csv")}>
              Save CSV
            </button>
          </div>
          <p className="ruler-basis">
            Save OBJ downloads the shell in metres, z up: the floor, one face
            per wall and the ceiling. Save CSV downloads every number with its
            bar. Both stay on this device.
          </p>
          <BasisDetails
            lead={`Each bar is 2 standard deviations over ${DEFAULT_TRIALS} simulated retakes of your taps. It leaves things out.`}
          >
            <p className="ruler-basis" data-testid="walls-basis">
              {cur.basis}
            </p>
          </BasisDetails>
        </>
      )}
    </section>
  );
}
