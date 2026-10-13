/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { useRef, useState } from "react";
import { getMode, tasksOf } from "../modes";
import {
  firstDownloadBytes,
  keepsDownloads,
  statedBytes,
} from "../vision/first-download";
import { modelOf } from "../vision/settings";
import { touchFirst } from "./device";
import {
  BIG_DOWNLOAD_BYTES,
  acceptDownload,
  downloadAccepted,
  needsConsent,
} from "./download-consent";

/** A mode waiting for a yes: its id and name, the bytes of model it still
 * has to fetch, and whether this browser will keep them. */
export type DownloadAsk = {
  mode: string;
  name: string;
  bytes: number;
  kept: boolean;
};

/** Every way of choosing a mode goes through `requestMode`. Where touch is
 * the main way in and the mode's model is a large one not yet on the device,
 * the mode does not change: `ask` is set and the page shows the card
 * (components/DownloadConsent.tsx). Everywhere else it is `onMode` itself,
 * called at once. */
export function useDownloadConsent(onMode: (id: string) => void) {
  const [ask, setAsk] = useState<DownloadAsk | null>(null),
    // The latest request wins: a slow lookup never opens a card over it.
    latest = useRef(0);
  const requestMode = (id: string) => {
    const mine = ++latest.current,
      mode = getMode(id),
      specs = tasksOf(mode),
      most = specs.reduce((sum, spec) => sum + statedBytes(spec), 0),
      said = specs.every((spec) => downloadAccepted(modelOf(spec)));
    setAsk(null);
    if (!needsConsent(most, touchFirst(), said)) return onMode(id);
    void (async () => {
      const base = new URL(import.meta.env.BASE_URL, location.href).href,
        bytes = await firstDownloadBytes(specs, base),
        kept = bytes > BIG_DOWNLOAD_BYTES && (await keepsDownloads());
      if (mine !== latest.current) return;
      // Already stored on this device: nothing to ask.
      if (!needsConsent(bytes, true, false)) return onMode(id);
      setAsk({ mode: id, name: mode.short, bytes, kept });
    })();
  };
  return {
    ask,
    requestMode,
    accept() {
      if (!ask) return;
      for (const spec of tasksOf(getMode(ask.mode)))
        acceptDownload(modelOf(spec));
      setAsk(null);
      onMode(ask.mode);
    },
    decline: () => setAsk(null),
  };
}
