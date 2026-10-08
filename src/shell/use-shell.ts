/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useEffect, useRef, useState } from "react";
import { COACH_STEPS } from "../components/CoachMarks";
import type { ShareResult } from "./share";
import { readFlag, writeFlag } from "./storage";

const COACH_KEY = "spectra.coach.v1";

/** The shell's own interface state: which overlays are open, which inspector
 * panel is on show, the immersive view, the first-run tips and the share card.
 * None of it touches inference; it only decides what is on screen. */
export function useShell() {
  const [palette, setPalette] = useState(false),
    [immersive, setImmersive] = useState(false),
    [tray, setTray] = useState(true),
    // Bumped when the tray is opened from the keyboard, to move focus into it.
    [trayFocus, setTrayFocus] = useState(0),
    [help, setHelp] = useState(false),
    [panel, setPanel] = useState<string | null>(null),
    [share, setShare] = useState<ShareResult | null>(null),
    // Step of the tips while their card is open, or null while it is closed.
    [coach, setCoach] = useState<number | null>(null),
    // True until the tips have been finished or closed once: the Tips pill
    // draws attention to itself instead of the card opening over the page.
    [coachFresh, setCoachFresh] = useState(() => !readFlag(COACH_KEY));
  const scroll = useRef(0);

  // The clip in the share card lives in this tab's memory: free it when the
  // card is replaced or dismissed, and when the app goes away.
  useEffect(
    () => () => {
      if (share) URL.revokeObjectURL(share.url);
    },
    [share],
  );
  // Opening help from the keyboard should also bring it into view.
  useEffect(() => {
    if (help)
      document.getElementById("help")?.scrollIntoView({ block: "nearest" });
  }, [help]);
  // The immersive view hides the page around the stage, which collapses the
  // document: remember where the reader was and put them back afterwards.
  // Nothing is locked, so there is no scroll state to leak if this unmounts.
  const toggleImmersive = () => {
    if (!immersive) scroll.current = window.scrollY;
    else requestAnimationFrame(() => window.scrollTo(0, scroll.current));
    setImmersive(!immersive);
  };
  const toggleTray = (focus: boolean) => {
    if (!tray && focus) setTrayFocus((n) => n + 1);
    setTray(!tray);
  };
  const openPanel = (id: string) => {
    setPanel(id);
    setImmersive(false);
    // On a narrow screen the rail sits below the stage: bring it into view.
    requestAnimationFrame(() =>
      document
        .querySelector(".inspector")
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  const endCoach = () => {
    writeFlag(COACH_KEY, "done");
    setCoachFresh(false);
    setCoach(null);
  };
  const toggleCoach = () => (coach === null ? setCoach(0) : endCoach());
  return {
    palette,
    setPalette,
    immersive,
    toggleImmersive,
    tray,
    trayFocus,
    toggleTray,
    help,
    setHelp,
    panel,
    openPanel,
    share,
    setShare,
    coach,
    coachFresh,
    toggleCoach,
    coachTarget: coach === null ? undefined : COACH_STEPS[coach]?.target,
    setCoach,
    endCoach,
  };
}
