import {
  Aperture,
  Camera,
  SquareArrowOutUpRight,
  ShieldCheck,
  Square,
  Upload,
} from "lucide-react";
import type { Mode } from "../vision/types";
export default function Header({
  mode,
  onMode,
  cameraActive,
  onCamera,
  onUpload,
  pending,
}: {
  mode: Mode;
  onMode: (m: Mode) => void;
  cameraActive: boolean;
  onCamera: () => void;
  onUpload: (f: File) => void;
  pending: boolean;
}) {
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="SPECTRA home"
        >
          <Aperture size={30} />
          SPECTRA
        </a>
        <nav className="modes" aria-label="Vision mode">
          {(["objects", "body", "hands"] as const).map((m) => (
            <button key={m} aria-pressed={m === mode} onClick={() => onMode(m)}>
              {m[0].toUpperCase() + m.slice(1)}
            </button>
          ))}
        </nav>
        <div className="top-right">
          <span className="privacy">
            <ShieldCheck size={21} />
            Processed on your device
          </span>
          <a
            className="icon-button"
            href="https://github.com/tarang-tj/spectra-vision"
            target="_blank"
            rel="noreferrer"
            aria-label="SPECTRA on GitHub"
          >
            <SquareArrowOutUpRight size={22} />
          </a>
        </div>
      </header>
      <section className="intro">
        <div>
          <h1>Reality, augmented.</h1>
          <p>Your camera. A new way to see.</p>
        </div>
        <div className="actions">
          <button
            className="button primary"
            onClick={onCamera}
            disabled={pending}
          >
            {cameraActive ? <Square size={20} /> : <Camera size={21} />}
            <span>
              {cameraActive
                ? "Stop camera"
                : pending
                  ? "Opening…"
                  : "Start camera"}
            </span>
          </button>
          <label className="button upload">
            <Upload size={21} />
            <span>Upload</span>
            <input
              aria-label="Upload image or video"
              type="file"
              accept="image/*,video/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </>
  );
}
