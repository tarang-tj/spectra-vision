/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchPicture,
  fetchSet,
  labelsOf,
  parseSet,
  type ScoreSet,
} from "../src/panels/lab/scorecard/score-set";
import labelMaps from "../src/panels/library/label-maps.json";

const read = (): ScoreSet =>
  JSON.parse(readFileSync(resolve("public/eval/set.json"), "utf8"));
const set = read();

describe("the pinned picture set", () => {
  it("is 100 pictures, each once, in ascending image id", () => {
    expect(set.items).toHaveLength(100);
    const ids = set.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(100);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(set.items.map((item) => item.file)).size).toBe(100);
  });
  it("has a header that matches its pictures", () => {
    const boxes = set.items.flatMap((item) => item.boxes);
    expect(set.pictures).toBe(set.items.length);
    expect(set.boxes).toBe(boxes.filter((box) => !box.crowd).length);
    expect(set.crowds).toBe(boxes.filter((box) => box.crowd).length);
    expect(set.bytes).toBe(
      set.items.reduce((sum, item) => sum + item.bytes, 0),
    );
    expect(set.id).toBe("spectra-score-v1");
    expect(set.source).toBe("COCO val2017");
    expect(set.labels).toBe("COCO Consortium, CC BY 4.0");
    expect(set.annotationsSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(set.builtOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(set.rule).toMatch(/CC BY 2\.0/);
    expect(set.rule).toMatch(/no person/);
  });
  it("uses only the detectors' own class names, and never person", () => {
    const names = new Set(labelMaps.detector.labels);
    expect(names.size).toBe(80);
    for (const item of set.items)
      for (const box of item.boxes) {
        expect(names.has(box.label), `${item.id}: ${box.label}`).toBe(true);
        expect(box.label).not.toBe("person");
      }
  });
  it("keeps every box inside its picture and gives every picture a real object", () => {
    for (const item of set.items) {
      expect(
        item.boxes.some((box) => !box.crowd),
        `${item.id}`,
      ).toBe(true);
      for (const box of item.boxes) {
        expect(box.x, `${item.id}`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${item.id}`).toBeGreaterThanOrEqual(0);
        expect(box.w, `${item.id}`).toBeGreaterThan(0);
        expect(box.h, `${item.id}`).toBeGreaterThan(0);
        expect(box.x + box.w, `${item.id}`).toBeLessThanOrEqual(item.width);
        expect(box.y + box.h, `${item.id}`).toBeLessThanOrEqual(item.height);
      }
    }
  });
  it("credits every picture: CC BY 2.0, its Flickr page, an author, a hash and the date read", () => {
    for (const item of set.items) {
      const where = `${item.id}`;
      expect(item.license, where).toBe("CC BY 2.0");
      expect(item.licenseUrl, where).toBe(
        "https://creativecommons.org/licenses/by/2.0/",
      );
      expect(item.page, where).toMatch(
        /^https:\/\/www\.flickr\.com\/photos\/[^/]+\/\d+\/$/,
      );
      expect(item.author.trim(), where).not.toBe("");
      expect(item.title.trim(), where).not.toBe("");
      expect(item.sha256, where).toMatch(/^[0-9a-f]{64}$/);
      expect(item.checked, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.bytes, where).toBeGreaterThan(0);
      expect(item.url, where).toBe(
        `http://images.cocodataset.org/val2017/${item.file}`,
      );
      expect(item.file, where).toBe(`${String(item.id).padStart(12, "0")}.jpg`);
    }
    // One Flickr page per picture.
    expect(new Set(set.items.map((item) => item.page)).size).toBe(100);
  });
});

describe("parseSet", () => {
  const broken = (change: (set: ScoreSet) => void) => () => {
    const copy = read();
    change(copy);
    return parseSet(copy);
  };
  it("accepts the pinned set and hands the labels to the matcher in pixels", () => {
    const parsed = parseSet(read()),
      first = parsed.items[0];
    expect(parsed.items).toHaveLength(100);
    expect(labelsOf(first)).toHaveLength(first.boxes.length);
    const { label, crowd, x, y, w, h } = first.boxes[0];
    expect(labelsOf(first)[0]).toEqual({ label, crowd, box: { x, y, w, h } });
  });
  it("refuses a picture that lost its credit, its hash or its page", () => {
    expect(broken((s) => (s.items[3].author = ""))).toThrow(/has no author/);
    expect(broken((s) => (s.items[3].page = " "))).toThrow(/has no page/);
    expect(broken((s) => (s.items[3].sha256 = "abc"))).toThrow(/SHA-256/);
    expect(
      broken(
        (s) => delete (s.items[3] as Partial<ScoreSet["items"][0]>).license,
      ),
    ).toThrow(/has no license/);
  });
  it("refuses a repeated picture, a box outside its picture and a header that disagrees", () => {
    expect(broken((s) => (s.items[1].id = s.items[0].id))).toThrow(
      /id of its own/,
    );
    expect(
      broken((s) => (s.items[0].boxes[0].w = s.items[0].width + 5)),
    ).toThrow(/outside the picture/);
    expect(broken((s) => s.items.pop())).toThrow(/header does not match/);
    expect(broken((s) => (s.boxes += 1))).toThrow(/header does not match/);
    expect(() => parseSet({})).toThrow(/no pictures/);
    expect(() => parseSet(null)).toThrow(/no pictures/);
  });
});

describe("fetching", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (body: BodyInit, status = 200) =>
    vi.fn(async () => new Response(body, { status }));
  it("asks for the list under eval/ only when called, and checks it", async () => {
    const fetched = answer(JSON.stringify(set));
    vi.stubGlobal("fetch", fetched);
    expect(fetched).not.toHaveBeenCalled();
    const got = await fetchSet("https://example.test/spectra/");
    expect(fetched.mock.calls[0][0]).toBe(
      "https://example.test/spectra/eval/set.json",
    );
    expect(got.items).toHaveLength(100);
    vi.stubGlobal("fetch", answer("{}"));
    await expect(fetchSet("https://example.test/")).rejects.toThrow(
      /no pictures/,
    );
    vi.stubGlobal("fetch", answer("gone", 404));
    await expect(fetchSet("https://example.test/")).rejects.toThrow(/HTTP 404/);
  });
  it("hands back a picture only when its bytes have the pinned SHA-256", async () => {
    const bytes = new TextEncoder().encode("not really a photograph"),
      item = {
        ...set.items[0],
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
      fetched = answer(bytes);
    vi.stubGlobal("fetch", fetched);
    const blob = await fetchPicture("https://example.test/", item);
    expect(fetched.mock.calls[0][0]).toBe(
      `https://example.test/eval/${item.file}`,
    );
    expect(blob.size).toBe(bytes.length);
    vi.stubGlobal("fetch", answer(new TextEncoder().encode("another file")));
    await expect(fetchPicture("https://example.test/", item)).rejects.toThrow(
      /SHA-256 differs/,
    );
    vi.stubGlobal("fetch", answer("gone", 404));
    await expect(fetchPicture("https://example.test/", item)).rejects.toThrow(
      /HTTP 404/,
    );
  });
});

describe("what keeps the pictures out of the repository and the offline cache", () => {
  it("ignores the downloaded photographs but not the list", () => {
    const lines = readFileSync(resolve(".gitignore"), "utf8").split("\n");
    expect(lines).toContain("public/eval/*.jpg");
    expect(lines).not.toContain("public/eval/");
  });
  it("tells the service worker to leave eval/ alone", () => {
    // The worker's own classify function, lifted out of its file and run.
    const source = readFileSync(resolve("public/sw.js"), "utf8"),
      body = source.match(/function classify\(url\) \{[\s\S]*?\n\}/)![0],
      classify = new Function("SCOPE", `${body}; return classify;`)(
        "https://example.test/spectra/",
      ) as (url: URL) => string | null;
    const kind = (path: string) =>
      classify(new URL(path, "https://example.test/spectra/"));
    expect(kind("eval/set.json")).toBeNull();
    expect(kind("eval/000000001993.jpg")).toBeNull();
    // The rules beside it are as they were.
    expect(kind("models/efficientdet_lite0.tflite")).toBe("models");
    expect(kind("assets/index-abc.js")).toBe("assets");
    expect(kind("vision-worker.js")).toBe("other");
    expect(kind("demo/clip.mp4")).toBeNull();
    expect(classify(new URL("https://elsewhere.test/eval/x.jpg"))).toBeNull();
    expect(source).toMatch(/eval\/\s+never cached/);
  });
});
