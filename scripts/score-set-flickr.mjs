/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// The Flickr side of scripts/build-score-set.mjs: fetch a photo's page once,
// keep it in the cache dir, and read what it states (licence, author, title)
// or the reason the picture is cut.
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

export const AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const run = promisify(execFile);
export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
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
/** One request to Flickr, through curl: Flickr answered this script's own
 * fetch with 429 on the hop that curl is let through. Gives the status, the
 * body, and where a redirect points. */
async function flickr(url, cacheDir) {
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
export async function flickrPage(photo, cacheDir) {
  const path = join(cacheDir, `flickr-${photo}.json`);
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {}
  // photo.gne sends the visitor on to the photo's own page. The hops are
  // followed by hand so that a photo which is gone (sent to Explore) or
  // private (sent to the sign-in page) is seen as that, without a request
  // to either.
  let url = `https://www.flickr.com/photo.gne?id=${photo}`,
    answer = await flickr(url, cacheDir);
  for (let hop = 0; hop < 5 && answer.next; hop++) {
    url = answer.next;
    if (/\/signin\/|\/photos\/\/\/$|identity\.flickr\.com/.test(url)) break;
    answer = await flickr(url, cacheDir);
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
export function readPage(page, photo) {
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
