// Scratch probe: what the segmenter reports in the ghost patch on the wall.
import { chromium } from "@playwright/test";
const gpu = process.argv[2] !== "cpu";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: gpu ? ["--use-angle=metal"] : ["--disable-gpu", "--use-angle=swiftshader"],
});
const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
await page.addInitScript(() => {
  localStorage.setItem("spectra.coach.v1", "1");
  const Native = window.Worker;
  window.Worker = class extends Native {
    constructor(url, options) {
      super(url, options);
      this.addEventListener("message", (event) => {
        const r = event.data?.result;
        if (r?.kind === "segment") window.__seg = r;
      });
    }
  };
});
await page.goto("http://127.0.0.1:5173/spectra-vision/", { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: "Segment", exact: true }).click();
await page.waitForFunction(() => window.__seg, null, { timeout: 90000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const r = window.__seg, e = r.extra, W = e.width;
  // Ghost patch on the 1094x684 stage at about x 920..1080, y 370..460 of a
  // stage whose origin is (33, 208): normalized x .81...96, y .24...37.
  const rows = [];
  for (let y = Math.round(0.22 * 256); y < Math.round(0.4 * 256); y += 3) {
    let line = "";
    for (let x = Math.round(0.78 * 256); x < Math.round(0.99 * 256); x += 2) {
      const i = y * W + x;
      line += `${e.mask[i]}${String(Math.round(e.alpha[i] / 2.55)).padStart(3, " ")} `;
    }
    rows.push(line);
  }
  let hist = new Array(11).fill(0), bgwin = 0, n = 0, max = 0;
  for (let y = Math.round(0.2 * 256); y < Math.round(0.42 * 256); y++)
    for (let x = Math.round(0.76 * 256); x < 256; x++) {
      const i = y * W + x; n++;
      hist[Math.floor(e.alpha[i] / 25.6)]++;
      if (e.mask[i] === e.background) bgwin++;
      max = Math.max(max, e.alpha[i]);
    }
  return { delegate: r.delegate, classes: e.classes.map((c) => `${c.label}:${c.pixels}:${c.score.toFixed(2)}`), hist, bgwin, n, max, rows };
});
console.log(JSON.stringify({ ...out, rows: undefined }));
console.log(out.rows.join("\n"));
await browser.close();
