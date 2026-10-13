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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve } from "node:path";

const WANTED = 100;
/** Step 4. Image id to the reason it was cut. Never a reason to do with what
 * a model found. */
const FACE_CUTS = {
  124659:
    "framed photographs on the cabinet show people's faces (looked at 2026-10-12)",
};
const RULE =
  "The first 100 COCO val2017 pictures by image id that COCO records as licence 4 (CC BY 2.0), that have no person annotation and at least one box that is not a crowd region, whose Flickr page still stated CC BY 2.0 on the date checked, and in which no recognisable face is visible.";
const AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const [annotationsPath, cacheDir] = process.argv.slice(2);
if (!annotationsPath || !cacheDir)
  throw new Error("usage: build-score-set.mjs <annotations.json> <cache dir>");
const root = resolve(import.meta.dirname, "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = promisify(execFile);
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const localDate = (time) => new Date(time).toLocaleDateString("en-CA");
const decode = (text) =>
  text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();

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

/** One request to Flickr, through curl: Flickr answered this script's own
 * fetch with 429 on the hop that curl is let through. Gives the status, the
 * body, and where a redirect points. */
async function flickr(url) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    const body = join(cacheDir, "page.tmp");
    try {
      const { stdout } = await run("curl", [
        ...["-sS", "--max-time", "60", "-A", AGENT, "-o", body],
        ...["-w", "%{http_code} %{redirect_url}", url],
      ]);
      const [status, next] = stdout.trim().split(" ");
      if (Number(status) < 500 && status !== "429" && status !== "000")
        return {
          status: Number(status),
          next: next || null,
          body: await readFile(body, "utf8"),
        };
      last = new Error(`HTTP ${status}`);
    } catch (error) {
      last = error;
    }
    await sleep(20000 * (attempt + 1));
  }
  throw new Error(`${url}: ${last.message}; stopped, nothing was written`);
}

/** The Flickr page of one photo: fetched once, then read from the cache. */
async function flickrPage(photo) {
  const path = join(cacheDir, `flickr-${photo}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {}
  // photo.gne sends the visitor on to the photo's own page. The hops are
  // followed by hand so that a photo which is gone (sent to Explore) or
  // private (sent to the sign-in page) is seen as that, without a request
  // to either.
  let url = `https://www.flickr.com/photo.gne?id=${photo}`,
    answer = await flickr(url);
  for (let hop = 0; hop < 5 && answer.next; hop++) {
    url = answer.next;
    if (/\/signin\/|\/photos\/\/\/$|identity\.flickr\.com/.test(url)) break;
    answer = await flickr(url);
  }
  const page = {
    status: answer.status,
    url,
    read: new Date().toISOString(),
    html: answer.status === 200 ? answer.body : "",
  };
  await writeFile(path, JSON.stringify(page));
  await sleep(1500);
  return page;
}

/** What the page states, or the reason the picture is cut. */
function readPage(page, photo) {
  // A photo that was deleted is sent to Explore, a private one to sign-in.
  if (/\/photos\/\/\/$/.test(page.url))
    return { cut: "Flickr no longer shows this photo" };
  if (/\/signin\/|identity\.flickr\.com/.test(page.url))
    return { cut: "Flickr asks for a sign-in to show this photo" };
  if (page.status !== 200) return { cut: `Flickr answered ${page.status}` };
  const { html } = page;
  const address = new RegExp(
    `^https://www\\.flickr\\.com/photos/[^/]+/${photo}/$`,
  );
  const link = html.match(/<meta property="og:url" content="([^"]+)"/)?.[1];
  if (!link || !address.test(link) || !address.test(page.url))
    return { cut: "the page is not this photo's page" };
  // First read of the licence: the link a visitor sees.
  const shown = [
    ...html.matchAll(
      /<a href="([^"]+)" class="license-text" rel="license[^"]*" title="([^"]*)"/g,
    ),
  ];
  if (!shown.length) return { cut: "no licence link on the page" };
  const byTwo = (m) =>
    /^https:\/\/creativecommons\.org\/licenses\/by\/2\.0\//.test(m[1]) &&
    m[2] === "CC BY 2.0";
  // Second read: the licence number in the page's own data (4 is CC BY 2.0).
  const numbers = new Set(
    [...html.matchAll(/"license":(\d+)/g)].map((m) => m[1]),
  );
  if (!numbers.size) return { cut: "no licence number in the page data" };
  if (!shown.every(byTwo))
    return {
      cut: `Flickr now states "${shown[0][2]}" (licence ${[...numbers].join(", ")})`,
    };
  if (numbers.size !== 1 || !numbers.has("4"))
    return { cut: "the licence link and the page data disagree" };
  // The author: the name beside the photo, and the owner in the page data.
  const beside = html.match(
    /class="owner-name truncate[^"]*"[^>]*>([^<]+)</,
  )?.[1];
  const owner = html.match(
    /"owner":\{"pathAlias":[^{}]*?"username":("(?:[^"\\]|\\.)*"),"realname":("(?:[^"\\]|\\.)*")/,
  );
  if (!beside || !owner) return { cut: "no author on the page" };
  const author = decode(beside),
    names = [JSON.parse(owner[1]), JSON.parse(owner[2])].map(decode);
  if (!author || !names.includes(author))
    return { cut: "the two reads of the author disagree" };
  // The title: two tags that must agree. Flickr supplies one for every photo.
  const first = html.match(/<meta name="title" content="([^"]*)"/)?.[1],
    second = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
  if (first === undefined || first !== second)
    return { cut: "the two reads of the title disagree" };
  return { page: link, author, title: decode(first), read: page.read };
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
  const seen = readPage(await flickrPage(photo), photo);
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
