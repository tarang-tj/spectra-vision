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
import { games, getGame } from "./games";
import type { GameState } from "./games";
import { defaultMode, getMode, modes } from "./modes";
import { buildCommands } from "./shell/commands";
import { trayEffects } from "./shell/effect-controls";
import { useOfflineCache, useScoreShare } from "./shell/use-studio-effects";
import { useShell } from "./shell/use-shell";
import { useShortcuts } from "./shell/use-shortcuts";
import { downloadSession } from "./session-export";
import { StudioContext } from "./studio-context";
import type { Studio } from "./studio-context";
import { useSource } from "./vision/useSource";
import { useVision } from "./vision/useVision";
import { Tracker } from "./vision/tracker";
import type { FrameData } from "./vision/frame";
import type { Track } from "./vision/types";
export default function App() {
  const [modeId, setModeId] = useState(defaultMode.id),
    [paused, setPaused] = useState(false),
    [mirror, setMirror] = useState(false),
    // One switch per registered effect, starting from each effect's default.
    [effectsOn, setEffectsOn] = useState<Record<string, boolean>>(() =>
      Object.fromEntries(effects.map((e) => [e.id, !!e.defaultOn])),
    ),
    [motionDemo, setMotionDemo] = useState(false),
    [confidence, setConfidence] = useState(0.45),
    [selected, setSelected] = useState<number | null>(null),
    [tracks, setTracks] = useState<Track[]>([]),
    [fps, setFps] = useState<number | null>(null),
    [gameId, setGameId] = useState<string | null>(null),
    [gameState, setGameState] = useState<GameState | null>(null),
    [immersiveEffects, setImmersiveEffects] = useState(false),
    [toast, setToast] = useState("");
  const shell = useShell(),
    stageActions = useRef<StageActions | null>(null);
  const mode = getMode(modeId),
    input = useSource(),
    vision = useVision(mode, input.source, paused, confidence),
    tracker = useRef(new Tracker()),
    history = useRef<unknown[]>([]),
    previous = useRef<number | null>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A game runs only in the mode it was written for.
  const game = getGame(gameId)?.requires === mode.id ? getGame(gameId) : null;
  const notice = (text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  };
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  useEffect(() => {
    tracker.current.reset();
    setTracks([]);
    setSelected(null);
    setFps(null);
    previous.current = null;
    history.current = [];
  }, [modeId, input.source?.generation]);
  useEffect(() => {
    const r = vision.result;
    if (!r) return;
    if (previous.current !== null) {
      // In a multi-task mode a secondary task reports under the primary
      // frame's time: that is not a new frame, so nothing is counted twice.
      if (r.time <= previous.current) return;
      const instant = 1000 / (r.time - previous.current);
      setFps((old) => (old === null ? instant : old * 0.8 + instant * 0.2));
    }
    previous.current = r.time;
    setTracks(tracker.current.update(r.detections, r.time));
    history.current.push({
      elapsedMs: Math.round(r.time),
      latencyMs: r.latency,
      detections: r.detections,
      landmarks: r.landmarks,
      handedness: r.handedness,
    });
    if (history.current.length > 1000) history.current.shift();
  }, [vision.result]);
  useEffect(() => {
    const video = input.source?.element;
    if (video instanceof HTMLVideoElement) {
      if (paused) video.pause();
      else
        void video
          .play()
          .catch(() =>
            notice("Playback could not resume. Choose the file again."),
          );
    }
  }, [paused, input.source]);
  useScoreShare(game, gameState, shell.setShare);
  useOfflineCache(mode, vision.status);
  useEffect(() => {
    if (!game) setGameState(null);
  }, [game]);
  const onMode = (next: string) => {
    if (next === modeId) return;
    setModeId(next);
    setGameId(null);
    setPaused(false);
    if (input.source?.kind === "demo") void input.demo(next, motionDemo);
  };
  const onDemo = () => {
    setPaused(false);
    setMirror(false);
    void input.demo(modeId, motionDemo);
  };
  const onMotionDemo = () => {
    const next = !motionDemo;
    setMotionDemo(next);
    setPaused(false);
    setMirror(false);
    void input.demo(modeId, next);
  };
  const onCamera = () => {
    setPaused(false);
    if (input.source?.kind === "camera") onDemo();
    else {
      setMotionDemo(false);
      setMirror(true);
      void input.camera();
    }
  };
  const onUpload = (file: File) => {
    setPaused(false);
    setMotionDemo(false);
    setMirror(false);
    void input.upload(file);
  };
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
    rows = useMemo(() => mode.inspector(data), [mode, data]);
  const studio: Studio = {
    mode,
    setMode: onMode,
    frame: data,
    rows,
    paused,
    status: input.pending ? "Opening source" : vision.status,
    setConfidence,
    toggleEffect: (id) => setEffectsOn((on) => ({ ...on, [id]: !on[id] })),
    select: setSelected,
    motionDemo: motionDemo && input.source?.kind === "demo",
    toggleMotionDemo: onMotionDemo,
    game: game?.id ?? null,
    gameState,
    setGame: setGameId,
    notice,
    panel: shell.panel,
    openPanel: shell.openPanel,
    immersive: shell.immersive,
  };
  // The immersive effects popover starts closed each time the view is entered.
  useEffect(() => {
    if (!shell.immersive) setImmersiveEffects(false);
  }, [shell.immersive]);
  const toggleEffects = (fromKeyboard: boolean) =>
    shell.immersive
      ? setImmersiveEffects((open) => !open)
      : shell.toggleTray(fromKeyboard);
  const playGame = (id: string | null) => {
    const needs = getGame(id)?.requires;
    if (needs && needs !== modeId) onMode(needs);
    setGameId(id);
  };
  useShortcuts(modes.length, shell.palette, (action) => {
    if (action.type === "palette") shell.setPalette(!shell.palette);
    else if (action.type === "mode") onMode(modes[action.index].id);
    else if (action.type === "record") stageActions.current?.record();
    else if (action.type === "screenshot") stageActions.current?.screenshot();
    else if (action.type === "mirror") setMirror((m) => !m);
    else if (action.type === "effects") toggleEffects(true);
    else if (action.type === "help") shell.setHelp(!shell.help);
    else if (action.type === "escape" && shell.immersive)
      shell.toggleImmersive();
  });
  // Built only while the palette is open: it is not needed otherwise.
  const commands = shell.palette
    ? buildCommands({
        modes,
        // Only the effects the tray offers in this mode.
        effects: trayEffects(mode),
        games,
        effectsOn,
        activeGame: game?.id ?? null,
        paused,
        immersive: shell.immersive,
        setMode: onMode,
        toggleEffect: studio.toggleEffect,
        playGame,
        actions: {
          record: () => stageActions.current?.record(),
          screenshot: () => stageActions.current?.screenshot(),
          mirror: () => setMirror((m) => !m),
          pause: () => setPaused((p) => !p),
          effects: () => toggleEffects(true),
          immersive: shell.toggleImmersive,
          help: () => shell.setHelp(!shell.help),
          exportSession,
          demo: onDemo,
          tour: () => shell.setCoach(0),
        },
      })
    : [];
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
          onCamera={onCamera}
          onUpload={onUpload}
          pending={input.pending}
          onPalette={() => shell.setPalette(true)}
        />
        <CameraPicker
          source={input.source}
          cameras={input.cameras}
          onPick={(deviceId) => {
            setPaused(false);
            void input.camera(deviceId);
          }}
        />
        <div className="workspace">
          <CameraStage
            mode={mode}
            data={data}
            paused={paused}
            onPause={() => setPaused((p) => !p)}
            onMirror={() => setMirror((m) => !m)}
            status={studio.status}
            error={input.error || vision.error}
            onRetry={
              input.error
                ? () => {
                    setPaused(false);
                    void input.camera();
                  }
                : vision.retry
            }
            retryLabel={input.error ? "Retry camera" : "Retry model"}
            onDemo={onDemo}
            notice={notice}
            game={game}
            onGameState={setGameState}
            actions={stageActions}
            onClip={(clip) =>
              shell.setShare({ kind: "clip", mode: modeId, ...clip })
            }
          >
            {/* The tips yield to a running game, whose own controls sit in
                the same corner of the stage. */}
            {shell.coach !== null && !shell.immersive && !game && (
              <CoachMarks
                step={shell.coach}
                onStep={shell.setCoach}
                onDone={shell.endCoach}
              />
            )}
          </CameraStage>
          <Inspector />
        </div>
        {shell.immersive && (
          <ImmersiveDock
            effectsOpen={immersiveEffects}
            onEffects={() => setImmersiveEffects((open) => !open)}
            onExit={shell.toggleImmersive}
          />
        )}
        <StudioDeck
          open={shell.tray}
          focusTray={shell.trayFocus}
          onToggle={() => shell.toggleTray(false)}
          onImmersive={shell.toggleImmersive}
        />
        {shell.share && (
          <ShareCard
            result={shell.share}
            onDismiss={() => shell.setShare(null)}
            notice={notice}
          />
        )}
        <Footer
          latency={vision.result?.latency ?? null}
          fps={paused ? 0 : fps}
          count={rows.length}
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
