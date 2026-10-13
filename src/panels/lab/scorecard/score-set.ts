/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The scorecard's picture set: its shape, a check of the file as fetched, and
// the two fetches. Nothing here runs until it is called: no request under
// eval/ is made by importing this file.
import type { Label } from "./match";

/** The photographs' total size, said on the page before the list is read.
 * Held to public/eval/set.json by tests/score-report.test.ts. */
export const SET_BYTES = 16_429_956;
export const SET_PATH = "eval/set.json";

/** A labelled box in the picture's own pixels, as COCO gives it. */
export type SetBox = {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** COCO's `iscrowd`: a region of many objects, not one object. */
  crowd: boolean;
};
/** One photograph, with what its licence asks to be shown beside it. */
export type SetItem = {
  /** COCO's image id. */
  id: number;
  file: string;
  /** Where setup downloads it from. The page fetches `eval/<file>`. */
  url: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  license: string;
  licenseUrl: string;
  /** The photograph's own page, where its licence is stated. */
  page: string;
  author: string;
  title: string;
  /** The date that page was read. */
  checked: string;
  boxes: SetBox[];
};
export type ScoreSet = {
  id: string;
  source: string;
  /** Who made the labels and their licence. */
  labels: string;
  labelsUrl: string;
  annotationsSha256: string;
  /** How the pictures were chosen, in one sentence. */
  rule: string;
  builtOn: string;
  pictures: number;
  /** Labelled objects that are not crowd regions. */
  boxes: number;
  crowds: number;
  bytes: number;
  items: SetItem[];
};

const TEXT = [
  "file",
  "url",
  "sha256",
  "license",
  "licenseUrl",
  "page",
  "author",
  "title",
  "checked",
] as const;
const HEADER = [
  "id",
  "source",
  "labels",
  "labelsUrl",
  "annotationsSha256",
  "rule",
  "builtOn",
] as const;
const whole = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;
const text = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

/** The set, or an Error that says what is wrong with the file. A picture with
 * no credit, no hash or a box outside it is refused here, before it can be
 * shown or scored. */
export function parseSet(value: unknown): ScoreSet {
  const fail = (what: string): never => {
    throw new Error(`The picture list is not usable: ${what}.`);
  };
  const set = value as ScoreSet;
  if (!set || typeof set !== "object" || !Array.isArray(set.items))
    return fail("it has no pictures");
  for (const key of HEADER) if (!text(set[key])) fail(`it has no ${key}`);
  if (!set.labelsUrl.startsWith("https://cocodataset.org/"))
    fail("the labels' terms are not on COCO's site");
  const seen = new Set<number>();
  let boxes = 0,
    crowds = 0,
    bytes = 0;
  for (const item of set.items) {
    const name = `picture ${item?.id}`;
    if (!item || !whole(item.id) || seen.has(item.id))
      fail(`${name} has no id of its own`);
    seen.add(item.id);
    for (const key of TEXT) if (!text(item[key])) fail(`${name} has no ${key}`);
    if (!/^[0-9a-f]{64}$/.test(item.sha256)) fail(`${name} has no SHA-256`);
    // The page shows these as links and names the licence beside the picture.
    if (!/^https:\/\/www\.flickr\.com\/photos\/[^/]+\/\d+\/$/.test(item.page))
      fail(`${name} does not link to its Flickr page`);
    if (item.license !== "CC BY 2.0") fail(`${name} is not CC BY 2.0`);
    if (item.licenseUrl !== "https://creativecommons.org/licenses/by/2.0/")
      fail(`${name} has another licence address`);
    if (!/^\d{12}\.jpg$/.test(item.file)) fail(`${name} has an odd file name`);
    if (!whole(item.width) || !whole(item.height) || !whole(item.bytes))
      fail(`${name} has no size`);
    if (!Array.isArray(item.boxes) || !item.boxes.length)
      fail(`${name} has no labels`);
    for (const box of item.boxes) {
      const sides = [box?.x, box?.y, box?.w, box?.h];
      if (!box || !text(box.label) || typeof box.crowd !== "boolean")
        fail(`${name} has a label with no name`);
      if (!sides.every((n) => typeof n === "number" && Number.isFinite(n)))
        fail(`${name} has a box that is not numbers`);
      if (
        box.x < 0 ||
        box.y < 0 ||
        !(box.w > 0) ||
        !(box.h > 0) ||
        box.x + box.w > item.width ||
        box.y + box.h > item.height
      )
        fail(`${name} has a box outside the picture`);
      if (box.crowd) crowds++;
      else boxes++;
    }
    bytes += item.bytes;
  }
  if (
    set.pictures !== set.items.length ||
    set.boxes !== boxes ||
    set.crowds !== crowds ||
    set.bytes !== bytes
  )
    fail("its header does not match its pictures");
  return set;
}
/** One picture's labels in the shape the matcher takes. */
export const labelsOf = (item: SetItem): Label[] =>
  item.boxes.map(({ label, crowd, x, y, w, h }) => ({
    label,
    crowd,
    box: { x, y, w, h },
  }));

/** Fetch and check the picture list. `base` is the page's base address,
 * ending in a slash. */
export async function fetchSet(
  base: string,
  signal?: AbortSignal,
): Promise<ScoreSet> {
  const response = await fetch(`${base}${SET_PATH}`, { signal });
  if (!response.ok)
    throw new Error(`The picture list did not load (HTTP ${response.status}).`);
  return parseSet(await response.json());
}

const hex = (digest: ArrayBuffer): string =>
  [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

/** Fetch one picture and refuse it unless its SHA-256 is the one in the set:
 * a run is only ever scored on the exact files the labels were made for. */
export async function fetchPicture(
  base: string,
  item: SetItem,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await fetch(`${base}eval/${item.file}`, { signal });
  if (!response.ok)
    throw new Error(`${item.file} did not load (HTTP ${response.status}).`);
  const bytes = await response.arrayBuffer(),
    digest = hex(await crypto.subtle.digest("SHA-256", bytes));
  if (digest !== item.sha256)
    throw new Error(`${item.file} is not the pinned file (SHA-256 differs).`);
  return new Blob([bytes], { type: "image/jpeg" });
}
