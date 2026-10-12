/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import type { CameraOption } from "../vision/camera-devices";
import type { CameraWant, Facing, Granted } from "../vision/camera-start";

const SIDES: { facing: Facing; label: string }[] = [
  { facing: "user", label: "Front" },
  { facing: "environment", label: "Rear" },
];

/** Which camera: Front or Rear on a device that has sides, and the named
 * list once the browser gives names. Before a camera is started the choice
 * only sets what Start camera will ask for; while one is live it switches. */
export default function CameraPicker({
  live,
  asking,
  named,
  sides,
  onPick,
}: {
  /** The live camera, or null before one is started. */
  live: Granted | null;
  /** What Start camera will ask for. */
  asking: CameraWant;
  named: CameraOption[];
  /** Whether Front and Rear mean anything on this device. */
  sides: boolean;
  onPick: (want: CameraWant) => void;
}) {
  const list = named.length > 1;
  if (!sides && !(list && live)) return null;
  // With nothing chosen or remembered, Start camera asks for the front.
  const facing = live
      ? live.facing
      : (asking.facing ?? (asking.deviceId ? undefined : "user")),
    id = (live ? live.deviceId : asking.deviceId) ?? "",
    listed = named.some((c) => c.deviceId === id);
  return (
    <div className="camera-picker">
      <span id="camera-picker-name">Camera</span>
      {sides && (
        <div
          className="camera-sides"
          role="group"
          aria-labelledby="camera-picker-name"
        >
          {SIDES.map((side) => (
            <button
              key={side.facing}
              aria-pressed={facing === side.facing}
              // Pressing the side that is already live must not restart it.
              onClick={() =>
                live?.facing !== side.facing && onPick({ facing: side.facing })
              }
            >
              {side.label}
            </button>
          ))}
        </div>
      )}
      {list && (
        <select
          aria-label="Camera source"
          value={listed ? id : ""}
          onChange={(e) =>
            e.target.value && onPick({ deviceId: e.target.value })
          }
        >
          {!listed && <option value="">Choose a camera</option>}
          {named.map((c) => (
            <option value={c.deviceId} key={c.deviceId}>
              {c.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
