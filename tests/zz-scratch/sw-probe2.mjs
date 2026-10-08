import { chromium } from "@playwright/test";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--disable-gpu", "--use-angle=swiftshader"],
});
const context = await browser.newContext({ viewport: { width: 1536, height: 1024 } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:5173/spectra-vision/", { waitUntil: "domcontentloaded" });
await page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 60000 });
await page.waitForTimeout(4000);
console.log(JSON.stringify(await page.evaluate(async () => {
  const src = [...document.scripts].find((s) => s.src).src;
  const key = (await caches.keys()).find((k) => k.startsWith("spectra-shell"));
  const cache = await caches.open(key);
  const stored = (await cache.keys()).find((r) => r.url === src);
  const hit = await cache.match(src);
  return {
    src, storedMode: stored?.mode, storedHeaders: [...(stored?.headers ?? [])],
    vary: hit?.headers.get("vary"),
    plain: !!(await cache.match(src)),
    cors: !!(await cache.match(new Request(src, { mode: "cors" }))),
    corsCreds: !!(await cache.match(new Request(src, { mode: "cors", credentials: "same-origin" }))),
    ignoreVary: !!(await cache.match(new Request(src, { mode: "cors" }), { ignoreVary: true })),
    withOrigin: !!(await cache.match(new Request(src, { headers: { Origin: location.origin } }))),
  };
}), null, 1));
// What does the SW actually see offline? Ask through a real crossorigin script load.
await context.setOffline(true);
console.log(JSON.stringify(await page.evaluate(async () => {
  const src = [...document.scripts].find((s) => s.src).src;
  const tryFetch = (init) => fetch(src, init).then((r) => r.status, (e) => String(e));
  return { plain: await tryFetch(), cors: await tryFetch({ mode: "cors" }), sameOrigin: await tryFetch({ mode: "same-origin" }), noCors: await tryFetch({ mode: "no-cors" }) };
})));
await browser.close();
