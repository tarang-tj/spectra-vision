import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--disable-gpu", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
const page = await context.newPage();
page.on("console", (m) => { if (!/^INFO|Graph|W0|I0/.test(m.text())) console.log("console", m.type(), m.text().slice(0, 300)); });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("requestfailed", (r) => console.log("failed", r.url().slice(-70), r.failure()?.errorText));
await page.goto("http://127.0.0.1:5173/spectra-vision/", { waitUntil: "domcontentloaded" });
await page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 60000 });
await page.waitForTimeout(4000);
const dump = () => page.evaluate(async () => {
  const out = {};
  for (const key of await caches.keys()) out[key] = (await (await caches.open(key)).keys()).map((r) => r.url.replace(location.origin, ""));
  const reg = await navigator.serviceWorker.getRegistration();
  return { controller: navigator.serviceWorker.controller?.scriptURL, scope: reg?.scope, active: reg?.active?.scriptURL, caches: out };
});
console.log(JSON.stringify(await dump(), null, 1));
await context.setOffline(true);
console.log("--- offline reload");
try { await page.reload({ waitUntil: "domcontentloaded", timeout: 20000 }); } catch (e) { console.log("reload error", e.message.slice(0, 200)); }
await page.waitForTimeout(6000);
console.log("title", await page.title(), "| h1:", await page.locator("h1").allInnerTexts(), "| latency:", await page.getByTestId("latency").allInnerTexts());
console.log((await page.content()).slice(0, 400));
await browser.close();
