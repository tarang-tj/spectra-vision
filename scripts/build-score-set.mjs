/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// One-off builder for the scorecard's picture set (public/eval/set.json).
// Not run by setup or by the gate. It applies a selection rule that was fixed
// before any model was run on these pictures:
//
//   1. Read COCO's official instances_val2017.json (from
//      http://images.cocodataset.org/annotations/annotations_trainval2017.zip).
//   2. Keep pictures whose COCO licence id is 4 (CC BY 2.0), that have no
//      annotation of the class person, and at least one box that is not a
//      crowd region.
//   3. In ascending image id, fetch the picture's Flickr page. Keep it only
//      if the page answers 200 and states CC BY 2.0 twice over: the visible
//      licence link and the licence number in the page's data must agree.
//      The author and the title are read twice as well.
//   4. Drop the pictures in FACE_CUTS: a person looked at every kept picture
//      once and cut those where a recognisable face can be seen.
//   5. Take the first 100 that pass, download each from COCO, and record its
//      SHA-256 and size.
//
// Usage: node scripts/build-score-set.mjs <instances_val2017.json> <cache dir>
// The cache dir holds the Flickr pages as fetched (with the time read) and a
// log of every candidate and its outcome; neither belongs in the repository.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { AGENT, flickrPage, readPage, sleep } from "./score-set-flickr.mjs";

const WANTED = 100;
/** Step 4. Image id to the reason it was cut. Never a reason to do with what
 * a model found. */
const FACE_CUTS = {
  124659:
    "framed photographs on the cabinet show people's faces (looked at 2026-10-12)",
};
const RULE =
  "The first 100 COCO val2017 pictures by image id that COCO records as licence 4 (CC BY 2.0), that have no person annotation and at least one box that is not a crowd region, whose Flickr page still stated CC BY 2.0 on the date checked, and in which no recognisable face is visible.";

const [annotationsPath, cacheDir] = process.argv.slice(2);
if (!annotationsPath || !cacheDir)
  throw new Error("usage: build-score-set.mjs <annotations.json> <cache dir>");
const root = resolve(import.meta.dirname, "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const localDate = (time) => new Date(time).toLocaleDateString("en-CA");

/** Fetch with three tries. A page that is gone is an answer; a busy server
 * or a dropped connection is not, and stops the build instead of quietly
 * changing which pictures are in the set. */
async function get(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": AGENT, "accept-language": "en-US,en" },
        signal: AbortSignal.timeout(60000),
      });
      if (response.status < 500 && response.status !== 429) return response;
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    await sleep(20000 * (attempt + 1));
  }
  throw new Error(`${url}: ${last.message}; stopped, nothing was written`);
}

/** The picture's bytes as COCO serves them, kept in public/eval. */
async function picture(image) {
  const path = join(root, "public/eval", image.file_name);
  try {
    return await readFile(path);
  } catch {}
  const response = await get(image.coco_url);
  if (!response.ok) throw new Error(`${image.coco_url}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
}

const annotationBytes = await readFile(annotationsPath);
const coco = JSON.parse(annotationBytes.toString("utf8"));
const names = new Map(coco.categories.map((c) => [c.id, c.name]));
const byImage = new Map();
for (const a of coco.annotations) {
  if (!byImage.has(a.image_id)) byImage.set(a.image_id, []);
  byImage.get(a.image_id).push(a);
}
const candidates = coco.images
  .filter((image) => {
    const list = byImage.get(image.id) ?? [];
    return (
      image.license === 4 &&
      !list.some((a) => names.get(a.category_id) === "person") &&
      list.some((a) => !a.iscrowd)
    );
  })
  .sort((a, b) => a.id - b.id);

await mkdir(cacheDir, { recursive: true });
await mkdir(join(root, "public/eval"), { recursive: true });
const items = [],
  log = [];
for (const image of candidates) {
  if (items.length === WANTED) break;
  const photo = image.flickr_url.match(/\/(\d+)_[0-9a-f]+_\w\.jpg$/)?.[1];
  if (!photo)
    throw new Error(`${image.id}: no photo id in ${image.flickr_url}`);
  const seen = readPage(await flickrPage(photo, cacheDir), photo);
  const cut = seen.cut ?? FACE_CUTS[image.id];
  log.push({ id: image.id, photo, outcome: cut ? `cut: ${cut}` : "kept" });
  if (cut) continue;
  const bytes = await picture(image);
  items.push({
    id: image.id,
    file: image.file_name,
    url: image.coco_url,
    sha256: sha256(bytes),
    bytes: bytes.length,
    width: image.width,
    height: image.height,
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0/",
    page: seen.page,
    author: seen.author,
    title: seen.title,
    checked: localDate(seen.read),
    boxes: byImage.get(image.id).map((a) => ({
      label: names.get(a.category_id),
      x: a.bbox[0],
      y: a.bbox[1],
      w: a.bbox[2],
      h: a.bbox[3],
      crowd: a.iscrowd === 1,
    })),
  });
}
await writeFile(
  join(cacheDir, "candidates.json"),
  JSON.stringify(log, null, 1),
);
const cuts = log.filter((entry) => entry.outcome !== "kept").length;
console.log(`${candidates.length} candidates, ${log.length} read, ${cuts} cut`);
if (items.length < WANTED)
  throw new Error(`only ${items.length} pictures pass; set.json not written`);
const all = items.flatMap((item) => item.boxes);
const set = {
  id: "spectra-score-v1",
  source: "COCO val2017",
  labels: "COCO Consortium, CC BY 4.0",
  labelsUrl: "https://cocodataset.org/#termsofuse",
  annotationsSha256: sha256(annotationBytes),
  rule: RULE,
  builtOn: localDate(Date.now()),
  pictures: items.length,
  boxes: all.filter((box) => !box.crowd).length,
  crowds: all.filter((box) => box.crowd).length,
  bytes: items.reduce((sum, item) => sum + item.bytes, 0),
  items,
};
await writeFile(
  join(root, "public/eval/set.json"),
  JSON.stringify(set, null, 2) + "\n",
);
console.log(
  `Wrote set.json: ${set.pictures} pictures, ${set.boxes} boxes, ${set.crowds} crowd regions, ${set.bytes} bytes`,
);
