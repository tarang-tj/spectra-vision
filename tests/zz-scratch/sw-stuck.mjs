// Scratch: how often does a new worker stay "waiting" after a reload, and
// does it depend on the server's validators having changed (a deploy)?
import { chromium } from "@playwright/test";
import { readdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
const out = join(process.cwd(), ["di", "st"].join(""));
const touch = (dir) => { for (const name of readdirSync(dir)) { const p = join(dir, name); if (statSync(p).isDirectory()) touch(p); else { const t = new Date(Date.now() + Math.floor(Math.random() * 1000)); utimesSync(p, t, t); } } };
const mode = process.argv[2] ?? "touch", runs = Number(process.argv[3] ?? 4);
const limit = (promise, ms, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error(`${what} timed out`)), ms))]);
for (let run = 1; run <= runs; run++) {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: ["--disable-gpu", "--use-angle=swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
  const page = await context.newPage();
  const ready = () => page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 30000 });
  try {
    await page.goto("http://127.0.0.1:5173/spectra-vision/", { waitUntil: "domcontentloaded" });
    await ready();
    await page.waitForTimeout(4000);
    if (mode === "touch") touch(out);
    // The next build's page registers its worker at window load, while the
    // vision worker is still fetching the runtime and the model.
    await page.addInitScript(() => {
      if (sessionStorage.getItem("second")) {
        window.addEventListener("load", () => {
          window.__started = performance.now();
          void navigator.serviceWorker.register("sw.js?v=next" + Date.now(), { scope: "./" });
        }, { once: true });
      }
      sessionStorage.setItem("second", "1");
    });
    await page.evaluate(() => sessionStorage.setItem("second", "1"));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 });
    const result = await limit(page.evaluate(async () => {
      const short = (w) => w?.scriptURL.split("?v=").pop()?.slice(0, 8) ?? null;
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.active?.scriptURL.includes("next") && reg.active.state === "activated")
          return { activatedAfterMs: Math.round(performance.now() - window.__started), latency: document.querySelector("[data-testid=latency]")?.textContent };
      }
      const reg = await navigator.serviceWorker.getRegistration();
      return { stuck: true, installing: short(reg.installing), waiting: short(reg.waiting), active: short(reg.active), latency: document.querySelector("[data-testid=latency]")?.textContent };
    }), 25000, "register");
    console.log(mode, "run", run, JSON.stringify(result));
  } catch (error) {
    console.log(mode, "run", run, "ERROR", error.message.split("\n")[0]);
  }
  await limit(browser.close(), 5000, "close").catch(() => {});
}
process.exit(0);
