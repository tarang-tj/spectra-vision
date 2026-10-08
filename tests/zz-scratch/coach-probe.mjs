import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-angle=metal"],
});
for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 600, height: 800 }, { width: 800, height: 600 }, { width: 1280, height: 720 }, { width: 1536, height: 1024 }]) {
  const page = await browser.newPage({ viewport });
  await page.goto("http://127.0.0.1:5173/spectra-vision/", { waitUntil: "domcontentloaded" });
  await page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 60000 });
  // Hands has the fullest toolbar.
  await page.getByRole("navigation", { name: "Vision mode" }).getByRole("button", { name: "Hands", exact: true }).click();
  await page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 60000 });
  for (let tip = 1; tip <= 3; tip++) {
    const hits = await page.evaluate(() => {
      const card = document.querySelector(".coach").getBoundingClientRect();
      const stage = document.querySelector(".camera-stage").getBoundingClientRect();
      const out = [];
      for (const el of document.querySelectorAll(".camera-stage button, .camera-stage .hud-badge, .camera-stage .playback span")) {
        if (el.closest(".coach")) continue;
        const b = el.getBoundingClientRect();
        if (!b.width) continue;
        if (b.left < card.right && b.right > card.left && b.top < card.bottom && b.bottom > card.top)
          out.push(el.getAttribute("aria-label") || el.textContent.trim());
      }
      return { card: [Math.round(card.top - stage.top), Math.round(card.bottom - stage.top)], stage: Math.round(stage.height), out };
    });
    console.log(viewport.width, "tip", tip, JSON.stringify(hits));
    if (tip < 3) await page.getByRole("button", { name: "Next tip" }).click();
  }
  await page.close();
}
await browser.close();
