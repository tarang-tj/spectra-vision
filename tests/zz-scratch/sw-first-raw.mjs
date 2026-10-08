// Scratch: first visit with no debugger on the service worker. What is cached?
import { spawn } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
const profile = process.argv[2],
  port = 9360 + Number(process.argv[3] ?? 0);
setTimeout(() => {
  console.log("HARD TIMEOUT");
  process.exit(1);
}, 60000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--no-first-run",
    "--window-size=1536,1024",
    "about:blank",
  ],
  { stdio: "ignore" },
);
try {
  let pageInfo;
  for (let i = 0; i < 50 && !pageInfo; i++) {
    await sleep(200);
    pageInfo = await fetch(`http://127.0.0.1:${port}/json/list`)
      .then((r) => r.json())
      .then(
        (list) => list.find((entry) => entry.type === "page"),
        () => null,
      );
  }
  const ws = new WebSocket(pageInfo.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) {
      waiting.get(d.id)(d);
      waiting.delete(d.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      waiting.set(++id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => resolve({ result: { result: { value: `TIMEOUT ${method}` } } }), 15000);
    });
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result?.result?.value;
  const list = () =>
    evaluate(`(async () => {
    const c = {}; for (const key of await caches.keys()) c[key] = (await (await caches.open(key)).keys()).map((r) => r.url.split("/spectra-vision/")[1]);
    return JSON.stringify({ latency: document.querySelector('[data-testid=latency]')?.textContent, controller: navigator.serviceWorker.controller?.scriptURL.split("?v=").pop() ?? null, caches: c }, null, 1);
  })()`);
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/spectra-vision/" });
  await sleep(9000);
  console.log("estimate", await evaluate(`navigator.storage.estimate().then((e) => JSON.stringify({ quotaMB: Math.round(e.quota / 1e6), usageMB: Math.round(e.usage / 1e6) }))`));
  const has = () => evaluate(`(async () => { const out = []; for (const key of await caches.keys()) for (const r of await (await caches.open(key)).keys()) out.push(r.url.split("/").pop()); return out.join(" "); })()`);
  console.log("before:", await has());
  await evaluate(`navigator.serviceWorker.ready.then((reg) => { reg.active.postMessage({ type: "adopt", urls: ["runtime/wasm/vision_wasm_internal.wasm", "runtime/wasm/vision_wasm_nosimd_internal.wasm", "runtime/wasm/vision_wasm_nosimd_internal.js", "models/pose_landmarker_lite.task", "models/selfie_multiclass_256x256.tflite", "demo/hands.png"].map((f) => new URL(f, location.href).href) }); return "sent"; })`);
  for (const wait of [3, 8]) {
    await sleep(wait === 3 ? 3000 : wait === 8 ? 5000 : 8000);
    console.log(`after ${wait} s:`, await has());
  }
  ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
  process.exit(0);
}
