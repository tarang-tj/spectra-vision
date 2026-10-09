import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import CameraPicker from "./components/CameraPicker";
import CameraStage from "./components/CameraStage";
import Inspector from "./components/Inspector";
import Footer from "./components/Footer";
import StudioDeck from "./components/StudioDeck";
import ShareCard from "./components/ShareCard";
import CoachMarks from "./components/CoachMarks";
import CommandPalette from "./components/CommandPalette";
import ImmersiveDock from "./components/ImmersiveDock";
import type { StageActions } from "./components/CameraStage";
import { effects } from "./effects";
import { getMode, modes } from "./modes";
import { paletteCommands } from "./shell/palette-commands";
import { useNarrow } from "./shell/use-narrow";
import { useOfflineCache } from "./shell/use-studio-effects";
import { useShell } from "./shell/use-shell";
import { useShortcuts } from "./shell/use-shortcuts";
import { useSourceControls } from "./shell/use-source-controls";
import { useToast } from "./shell/use-toast";
import { downloadSession } from "./session-export";
import { stageHooks } from "./stage/stage-hooks";
import { StudioContext } from "./studio-context";
import type { Studio } from "./studio-context";
import { useSession } from "./vision/useSession";
import { useVision } from "./vision/useVision";
import { webgl2Missing } from "./vision/webgl-probe";
import type { FrameData } from "./vision/frame";
export default function App() {
  // One switch per registered effect, starting from each effect's default.
  const [effectsOn, setEffectsOn] = useState<Record<string, boolean>>(() =>
      Object.fromEntries(effects.map((e) => [e.id, !!e.defaultOn])),
    ),
    [confidence, setConfidence] = useState(0.45),
    [selected, setSelected] = useState<number | null>(null),
    [immersiveEffects, setImmersiveEffects] = useState(false);
  const shell = useShell(),
    narrow = useNarrow(),
    [toast, notice] = useToast(),
    stageActions = useRef<StageActions | null>(null);
  const controls = useSourceControls(notice),
    { input, modeId, paused, mirror, motionDemo, onMode, onDemo } = controls,
    mode = getMode(modeId),
    vision = useVision(mode, input.source, paused, confidence),
    { tracks, fps, history } = useSession(mode, input.source, vision.result);
  useEffect(() => {
    setSelected(null);
  }, [modeId, input.source?.generation]);
  useOfflineCache();
  const exportSession = () => {
    downloadSession(
      modeId,
      input.source?.kind ?? null,
      { confidence, mirror, ...effectsOn, motionDemo },
      history.current,
    );
    notice("Session exported.");
  };
  const element = input.source?.element,
    aspect =
      element instanceof HTMLVideoElement
        ? element.videoWidth / element.videoHeight
        : element instanceof HTMLImageElement
          ? element.naturalWidth / element.naturalHeight
          : 1;
  // The canvas-free frame state shared by the stage, the inspector and panels.
  // It is rebuilt only when one of its parts changes, never per drawn frame.
  const settings = useMemo(
      () => ({ confidence, selected, effects: effectsOn }),
      [confidence, selected, effectsOn],
    ),
    data: FrameData = useMemo(
      () => ({
        result: vision.result,
        tracks,
        mirror,
        settings,
        source: input.source,
        aspect,
      }),
      [vision.result, tracks, mirror, settings, input.source, aspect],
    ),
    rows = useMemo(() => mode.inspector(data), [mode, data]),
    count = useMemo(
      () => mode.count?.(data) ?? rows.length,
      [mode, data, rows],
    );
  const toggleEffect = (id: string) => {
    const effect = effects.find((e) => e.id === id);
    // The tray disables these switches; the palette reaches this instead.
    if (effect?.kind === "gl" && !effectsOn[id] && webgl2Missing())
      return notice(`${effect.label} needs WebGL2, which is not available.`);
    setEffectsOn((on) => ({ ...on, [id]: !on[id] }));
  };
  const studio: Studio = {
    mode,
    setMode: onMode,
    frame: data,
    rows,
    count,
    paused,
    setPaused: controls.setPaused,
    status: input.pending ? "Opening source" : vision.status,
    setConfidence,
    toggleEffect,
    select: setSelected,
    motionDemo: motionDemo && input.source?.kind === "demo",
    toggleMotionDemo: controls.onMotionDemo,
    notice,
    panel: shell.panel,
    openPanel: shell.openPanel,
    immersive: shell.immersive,
    stage: stageHooks,
  };
  // The immersive effects popover starts closed each time the view is entered.
  useEffect(() => {
    if (!shell.immersive) setImmersiveEffects(false);
  }, [shell.immersive]);
  const toggleEffects = (fromKeyboard: boolean) =>
    shell.immersive
      ? setImmersiveEffects((open) => !open)
      : shell.toggleTray(fromKeyboard);
  useShortcuts(modes.length, shell.palette, (action) => {
    if (action.type === "palette") shell.setPalette(!shell.palette);
    else if (action.type === "mode") onMode(modes[action.index].id);
    else if (action.type === "record") stageActions.current?.record();
    else if (action.type === "screenshot") stageActions.current?.screenshot();
    else if (action.type === "mirror") controls.toggleMirror();
    else if (action.type === "effects") toggleEffects(true);
    else if (action.type === "help") shell.setHelp(!shell.help);
    else if (action.type === "escape" && shell.immersive)
      shell.toggleImmersive();
  });
  const commands = paletteCommands(shell.palette, {
    mode,
    effectsOn,
    paused,
    immersive: shell.immersive,
    setMode: onMode,
    toggleEffect,
    actions: {
      record: () => stageActions.current?.record(),
      screenshot: () => stageActions.current?.screenshot(),
      mirror: () => controls.toggleMirror(),
      pause: () => controls.togglePaused(),
      effects: () => toggleEffects(true),
      immersive: shell.toggleImmersive,
      help: () => shell.setHelp(!shell.help),
      exportSession,
      demo: onDemo,
      tour: () => shell.setCoach(0),
    },
  });
  // In one column the rail comes after the tray and the result card, so it is
  // also placed after them in the markup: focus then moves in reading order.
  const rail = <Inspector key="rail" />;
  // The tips card opens from the Tips pill, in the page flow above the
  // workspace: it never sits on the stage or the rail. It steps aside while
  // the stage is reporting an error, and comes back once that is resolved.
  const tips = shell.coach !== null &&
    !shell.immersive &&
    !input.error &&
    !vision.error && (
      <CoachMarks
        step={shell.coach}
        onStep={shell.setCoach}
        onDone={shell.endCoach}
      />
    );
  return (
    <StudioContext.Provider value={studio}>
      <main
        className={`app ${shell.immersive ? "immersive" : ""}`}
        data-coach-step={shell.coachTarget}
      >
        <Header
          mode={mode}
          onMode={onMode}
          cameraActive={input.source?.kind === "camera"}
          onCamera={controls.onCamera}
          onUpload={controls.onUpload}
          pending={input.pending}
          onPalette={() => shell.setPalette(true)}
          tips={{
            open: shell.coach !== null,
            fresh: shell.coachFresh,
            onToggle: shell.toggleCoach,
          }}
        />
        {tips}
        <CameraPicker
          source={input.source}
          cameras={input.cameras}
          onPick={controls.openCamera}
        />
        <div className="workspace">
          <CameraStage
            key="stage"
            mode={mode}
            data={data}
            paused={paused}
            onPause={controls.togglePaused}
            onMirror={controls.toggleMirror}
            status={studio.status}
            error={input.error || vision.error}
            onRetry={input.error ? () => controls.openCamera() : vision.retry}
            retryLabel={input.error ? "Retry camera" : "Retry model"}
            onDemo={onDemo}
            notice={notice}
            actions={stageActions}
            onClip={(clip) => shell.setShare({ mode: modeId, ...clip })}
          />
          {!narrow && rail}
          <StudioDeck
            key="deck"
            open={shell.tray}
            focusTray={shell.trayFocus}
            onToggle={() => shell.toggleTray(false)}
            onImmersive={shell.toggleImmersive}
          />
          {shell.share && (
            <ShareCard
              key="share"
              result={shell.share}
              onDismiss={() => shell.setShare(null)}
              notice={notice}
            />
          )}
          {narrow && rail}
        </div>
        {shell.immersive && (
          <ImmersiveDock
            effectsOpen={immersiveEffects}
            onEffects={() => setImmersiveEffects((open) => !open)}
            onExit={shell.toggleImmersive}
          />
        )}
        <Footer
          latency={vision.result?.latency ?? null}
          fps={paused ? 0 : fps}
          count={count}
          onExport={exportSession}
          help={shell.help}
          onHelp={() => shell.setHelp(!shell.help)}
        />
        {shell.palette && (
          <CommandPalette
            commands={commands}
            onClose={() => shell.setPalette(false)}
          />
        )}
        {toast && (
          <div role="status" className="toast">
            {toast}
          </div>
        )}
      </main>
    </StudioContext.Provider>
  );
}
