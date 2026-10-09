/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
import { test, expect, type Page } from "@playwright/test";

const film = (page: Page) => page.locator("video");
/** Facts about the video element, read in the page. */
const facts = (page: Page) =>
  film(page).evaluate((video: HTMLVideoElement) => ({
    source: video.currentSrc,
    error: video.error?.code ?? null,
    duration: video.duration,
    width: video.videoWidth,
    height: video.videoHeight,
    poster: video.poster,
    tracks: [...video.textTracks].map((track) => ({
      kind: track.kind,
      language: track.language,
      mode: track.mode,
      cues: track.cues?.length ?? 0,
    })),
  }));

for (const viewport of [
  { width: 1536, height: 1024 },
  { width: 390, height: 844 },
])
  test(`watch page plays the version 2.2 demo with captions at ${viewport.width} px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    // The explicit file name works on the development server too.
    await page.goto("./demo/index.html", { waitUntil: "domcontentloaded" });
    await expect(film(page)).toBeVisible();
    // The video loads from the page's own folder, under any base path.
    await expect
      .poll(async () => (await facts(page)).duration, { timeout: 60_000 })
      .toBeGreaterThan(0);
    const loaded = await facts(page);
    expect(loaded.error).toBeNull();
    expect(new URL(loaded.source).pathname).toBe(
      new URL("spectra-demo-v2.2.0.mp4", page.url()).pathname,
    );
    expect(loaded.duration).toBeGreaterThanOrEqual(75);
    expect(loaded.duration).toBeLessThanOrEqual(95);
    expect([loaded.width, loaded.height]).toEqual([1920, 1080]);
    const poster = await page.request.get(loaded.poster);
    expect(poster.status()).toBe(200);
    expect(poster.headers()["content-type"]).toContain("image/jpeg");

    // One English captions track, on by default, with every sentence loaded.
    await expect
      .poll(async () => (await facts(page)).tracks[0]?.cues, {
        timeout: 60_000,
      })
      .toBe(20);
    expect((await facts(page)).tracks).toEqual([
      { kind: "captions", language: "en", mode: "showing", cues: 20 },
    ]);

    // Seeking lands where asked, with a decoded frame and the caption spoken
    // at that moment.
    const sought = await film(page).evaluate(
      (video: HTMLVideoElement) =>
        new Promise<{ time: number; state: number; caption: string }>(
          (done) => {
            video.addEventListener(
              "seeked",
              () =>
                // Cues become active a moment after the seek settles.
                setTimeout(
                  () =>
                    done({
                      time: video.currentTime,
                      state: video.readyState,
                      caption: [...(video.textTracks[0].activeCues ?? [])]
                        .map((cue) => (cue as VTTCue).text)
                        .join(" "),
                    }),
                  500,
                ),
              { once: true },
            );
            video.currentTime = 38;
          },
        ),
    );
    expect(sought.time).toBeCloseTo(38, 1);
    expect(sought.state).toBeGreaterThanOrEqual(2);
    expect(sought.caption).toContain("The Ruler now measures a room");

    // Nothing spills sideways, and the way back to the studio stays in the
    // deployed folder.
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const box = (await film(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await page
        .getByRole("link", { name: "Try SPECTRA" })
        .evaluate((link: HTMLAnchorElement) => new URL(link.href).pathname),
    ).toBe(new URL("../", page.url()).pathname);
  });
