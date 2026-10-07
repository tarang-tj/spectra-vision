import type { Source } from "../vision/types";

/** Camera chooser, shown only while a camera is live and more than one exists. */
export default function CameraPicker({
  source,
  cameras,
  onPick,
}: {
  source: Source | null;
  cameras: MediaDeviceInfo[];
  onPick: (deviceId: string) => void;
}) {
  if (source?.kind !== "camera" || cameras.length <= 1) return null;
  const stream = (source.element as HTMLVideoElement).srcObject;
  return (
    <label className="camera-picker">
      Camera{" "}
      <select
        aria-label="Camera source"
        value={
          stream instanceof MediaStream
            ? stream.getVideoTracks()[0]?.getSettings().deviceId
            : ""
        }
        onChange={(e) => onPick(e.target.value)}
      >
        {cameras.map((c, i) => (
          <option value={c.deviceId} key={c.deviceId}>
            {c.label || `Camera ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );
}
