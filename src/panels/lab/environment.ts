/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// What the lab knows about its surroundings: the model catalogue bundled from
// scripts/models.json at build time, and the device the page is running on.
import catalogue from "../../../scripts/models.json";
import type { BenchReport } from "./benchmark-report";

export type ModelCard = {
  file: string;
  url: string;
  sha256: string;
  bytes: number | null;
  license: string;
  /** Where the licence is stated, or that the model's own card states none. */
  licenseNote: string;
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** The catalogue entry for a model file, or null when it is not listed. Read
 * field by field, so an entry with extra or missing fields cannot break it. */
export function modelCard(file: string): ModelCard | null {
  const entry = (catalogue as Record<string, unknown>[]).find(
    (item) => item.file === file,
  );
  if (!entry) return null;
  return {
    file,
    url: text(entry.url),
    sha256: text(entry.sha256),
    bytes: typeof entry.bytes === "number" ? entry.bytes : null,
    license: text(entry.license),
    licenseNote: text(entry.licenseNote),
  };
}

const hashes = new Map<string, Promise<string | null>>();

/** SHA-256 of the model file as this browser receives it (normally straight
 * from the HTTP cache the worker filled). Null when it cannot be computed. */
export function hashModel(file: string): Promise<string | null> {
  let pending = hashes.get(file);
  if (!pending) {
    pending = (async () => {
      try {
        const base = new URL(import.meta.env.BASE_URL, location.href).href,
          response = await fetch(`${base}models/${file}`);
        if (!response.ok) return null;
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await response.arrayBuffer(),
        );
        return [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
      } catch {
        return null;
      }
    })();
    hashes.set(file, pending);
  }
  return pending;
}

/** The GPU as WebGL names it. Uses a throwaway context that is released at
 * once; "not available" when WebGL or the debug extension is refused. */
function gpuName(): string {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return "not available (no WebGL2 context)";
    const info = gl.getExtension("WEBGL_debug_renderer_info"),
      name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name || "not available (renderer name withheld)";
  } catch {
    return "not available";
  }
}

type Brands = { brands?: { brand: string; version: string }[] };

/** Browser name and version, from the user agent the browser reports. */
function browserName(): string {
  const ua = navigator.userAgent,
    match =
      /(Edg|OPR|Firefox|Chrome|Version)\/([\d.]+)/.exec(ua) ??
      /(Safari)\/([\d.]+)/.exec(ua),
    names: Record<string, string> = { Edg: "Edge", OPR: "Opera" },
    brand = (
      navigator as Navigator & { userAgentData?: Brands }
    ).userAgentData?.brands?.find((b) => !/not.?a.?brand/i.test(b.brand));
  if (!match) return brand ? `${brand.brand} ${brand.version}` : "unknown";
  const name =
    match[1] === "Version" ? "Safari" : (names[match[1]] ?? match[1]);
  return `${name} ${match[2]}`;
}

export function describeDevice(): BenchReport["device"] {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: nav.userAgent,
    browser: browserName(),
    platform: nav.platform || "unknown",
    cores: nav.hardwareConcurrency || null,
    memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    gpu: gpuName(),
  };
}

/** Backing-store size of the stage canvas, read from the element itself. */
export function stageCanvasSize(): BenchReport["canvas"] {
  const canvas = document.querySelector<HTMLCanvasElement>(
    ".camera-stage canvas",
  );
  if (!canvas || !canvas.clientWidth) return null;
  return {
    width: canvas.width,
    height: canvas.height,
    dpr: Math.round((canvas.width / canvas.clientWidth) * 100) / 100,
  };
}

/** Save text as a file. Built in memory and saved by the browser: nothing is
 * uploaded. */
export function downloadText(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
