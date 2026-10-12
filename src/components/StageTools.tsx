/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import {
  Camera,
  Circle,
  Eraser,
  Expand,
  FlipHorizontal,
  RotateCcw,
  Square,
  SwitchCamera,
} from "lucide-react";

/** The tool row at the foot of the stage. It stays on show in fullscreen, so
 * anything that must be reachable there (the camera flip) lives here. */
export default function StageTools(props: {
  hasSource: boolean;
  mirror: boolean;
  recording: boolean;
  canRecord: boolean;
  onDemo: () => void;
  /** Present only for a mode with something to clear (light trails). */
  onClear?: () => void;
  /** Present only while a camera is live and there is another to go to. */
  onFlip?: () => void;
  onMirror: () => void;
  onShot: () => void;
  onRecord: () => void;
  onExpand: () => void;
}) {
  return (
    <div className="stage-tools">
      <button
        className="tool"
        onClick={props.onDemo}
        aria-label="Use demo image"
      >
        <RotateCcw size={20} />
        <span>Demo</span>
      </button>
      {props.onClear && (
        <button
          className="tool"
          onClick={props.onClear}
          aria-label="Clear light trails"
        >
          <Eraser size={20} />
          <span>Clear</span>
        </button>
      )}
      {/* Below 1100 px the tool captions are hidden, so each tool carries
          its name itself. */}
      {props.onFlip && (
        <button
          className="tool flip-tool"
          aria-label="Flip camera"
          onClick={props.onFlip}
        >
          <SwitchCamera size={20} />
          <span>Flip</span>
        </button>
      )}
      <button
        className="tool"
        aria-label="Mirror"
        aria-pressed={props.mirror}
        onClick={props.onMirror}
      >
        <FlipHorizontal size={20} />
        <span>Mirror</span>
      </button>
      <button
        className="tool"
        aria-label="Screenshot"
        onClick={props.onShot}
        disabled={!props.hasSource}
        aria-keyshortcuts="S"
      >
        <Camera size={20} />
        <span>Screenshot</span>
      </button>
      <button
        className="tool record-tool"
        aria-label={props.recording ? "Stop recording" : "Record canvas"}
        aria-pressed={props.recording}
        onClick={props.onRecord}
        disabled={!props.canRecord}
      >
        {props.recording ? <Square size={20} /> : <Circle size={20} />}
        <span>{props.recording ? "Stop" : "Record"}</span>
      </button>
      <button className="tool" aria-label="Fullscreen" onClick={props.onExpand}>
        <Expand size={20} />
        <span>Fullscreen</span>
      </button>
    </div>
  );
}
