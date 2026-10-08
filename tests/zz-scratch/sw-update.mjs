// Scratch: a second production build with a changed file must replace the
// old shell cache, and the reload must show the new page, never the old one.
import { chromium } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
const main = "src/main.tsx", original = readFileSync(main, "utf8");
if (original.includes("dataset.build")) throw new Error("main.tsx is not clean");
const build = () => execSync("pnpm run build", { env: { ...process.env, PAGES_BUILD: "1" }, stdio: "ignore", timeout: 120000 });
const limit = (promise, ms, what) => Promise.race([promise, new Promise((_, no) => setTimeout(() => no(new Error(`${what} timed out after ${ms} ms`)), ms))]);
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--disable-gpu", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
const page = await context.newPage();
page.on("console", (m) => { if (!/^[IW]\d|^INFO|Graph/.test(m.text())) console.log("   console", m.type(), m.text().slice(0, 200)); });
page.on("requestfailed", (r) => console.log("   request failed", r.url().split("/").slice(-2).join("/"), r.failure()?.errorText));
const ready = () => page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 30000 }).catch((e) => console.log("   not ready:", e.message.split("\n")[0]));
const state = (label) => limit(page.evaluate(async () => {
  const caches_ = {};
  for (const key of await caches.keys()) caches_[key] = (await (await caches.open(key)).keys()).length;
  const regs = await navigator.serviceWorker.getRegistrations();
  const short = (w) => w?.scriptURL.split("?v=").pop() ?? null;
  return {
    script: [...document.scripts].find((s) => s.src)?.src.split("/").pop(),
    marker: document.documentElement.dataset.build ?? null,
    readyState: document.readyState,
    controller: short(navigator.serviceWorker.controller),
    installing: short(regs[0]?.installing), waiting: short(regs[0]?.waiting), active: short(regs[0]?.active),
    caches: caches_,
  };
}), 15000, "state").then((s) => console.log(label, JSON.stringify(s)), (e) => console.log(label, "FAILED:", e.message));
try {
  build();
  await page.goto("http://127.0.0.1:5173/spectra-vision/", { waitUntil: "domcontentloaded" });
  await ready();
  await page.waitForTimeout(4000);
  await state("A  first visit       ");
  writeFileSync(main, original + '\ndocument.documentElement.dataset.build = "b";\n');
  build();
  console.log("-- rebuilt with a changed file");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch((e) => console.log("   reload failed:", e.message.split("\n")[0]));
  await ready();
  await state("B  right after reload");
  await page.waitForTimeout(6000);
  await state("B  6 s later         ");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }).catch((e) => console.log("   offline reload failed:", e.message.split("\n")[0]));
  await ready();
  await state("B  offline reload    ");
  await context.setOffline(false);
} finally {
  writeFileSync(main, original);
  build();
  console.log("-- source restored and rebuilt");
  await limit(browser.close(), 10000, "close").catch((e) => console.log(e.message));
  process.exit(0);
}
