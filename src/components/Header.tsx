import {
  Aperture,
  Camera,
  Lightbulb,
  Search,
  SquareArrowOutUpRight,
  ShieldCheck,
  Square,
  Upload,
} from "lucide-react";
import { modes } from "../modes";
import type { ModeDef } from "../modes";
import ModeSwitch from "./ModeSwitch";
export default function Header({
  mode,
  onMode,
  cameraActive,
  onCamera,
  onUpload,
  pending,
  onPalette,
  tips,
}: {
  mode: ModeDef;
  onMode: (id: string) => void;
  cameraActive: boolean;
  onCamera: () => void;
  onUpload: (f: File) => void;
  pending: boolean;
  onPalette: () => void;
  /** The Tips pill: whether its card is open, and whether it is a first visit. */
  tips: { open: boolean; fresh: boolean; onToggle: () => void };
}) {
  return (
    <>
      <header className="topbar" data-many={modes.length > 4}>
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="SPECTRA home"
        >
          <Aperture size={30} />
          SPECTRA
        </a>
        <ModeSwitch mode={mode} onMode={onMode} />
        <div className="top-right">
          <span className="privacy">
            <ShieldCheck size={21} />
            Processed on your device
          </span>
          <button
            className="icon-button"
            aria-label="Open command palette"
            aria-keyshortcuts="Control+K Meta+K"
            title="Command palette (Ctrl K or ⌘ K)"
            onClick={onPalette}
          >
            <Search size={20} />
          </button>
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
        <div className="actions" data-coach="source">
          <button
            className="button tips-pill"
            data-fresh={tips.fresh || undefined}
            aria-expanded={tips.open}
            aria-controls="coach-card"
            title={tips.fresh ? "New here? Three short tips" : undefined}
            onClick={tips.onToggle}
          >
            <Lightbulb size={20} />
            <span>Tips</span>
          </button>
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
