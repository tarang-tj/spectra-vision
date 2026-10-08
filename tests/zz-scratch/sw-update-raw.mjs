// Scratch: the two-build update flow driven over a raw DevTools connection to
// the page only, so no debugger is attached to the service workers.
import { spawn, execSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
const profile = process.argv[2],
  port = 9333 + Number(process.argv[3] ?? 0);
const main = "src/main.tsx",
  original = readFileSync(main, "utf8");
if (original.includes("dataset.build")) throw new Error("main.tsx is not clean");
const build = () =>
  execSync("pnpm run build", {
    env: { ...process.env, PAGES_BUILD: "1" },
    stdio: "ignore",
    timeout: 120000,
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });
build();
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--no-first-run",
    "--no-default-browser-check",
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
    });
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
    ).result?.result?.value;
  const ready = async () => {
    for (let i = 0; i < 300; i++) {
      await sleep(200);
      const text = await evaluate(
        `document.querySelector('[data-testid=latency]')?.textContent ?? ''`,
      );
      if (/^\d+ ms$/.test(text ?? "")) return true;
    }
    return false;
  };
  const state = (label) =>
    evaluate(`(async () => {
    const c = {}; for (const key of await caches.keys()) c[key] = (await (await caches.open(key)).keys()).length;
    const reg = (await navigator.serviceWorker.getRegistrations())[0];
    const short = (w) => w?.scriptURL.split("?v=").pop() ?? null;
    return JSON.stringify({ script: [...document.scripts].find((s) => s.src)?.src.split("/").pop(), marker: document.documentElement.dataset.build ?? null,
      controller: short(navigator.serviceWorker.controller), installing: short(reg?.installing), waiting: short(reg?.waiting), active: short(reg?.active), caches: c });
  })()`).then((s) => console.log(label, s));
  await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:5173/spectra-vision/" });
  console.log("ready:", await ready());
  await sleep(4000);
  await state("A  first visit       ");
  writeFileSync(
    main,
    original + '\ndocument.documentElement.dataset.build = "b";\n',
  );
  build();
  await send("Page.reload");
  await sleep(500);
  console.log("ready:", await ready());
  await state("B  right after reload");
  await sleep(6000);
  await state("B  6 s later         ");
  ws.close();
} finally {
  writeFileSync(main, original);
  build();
  chrome.kill();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true });
  process.exit(0);
}
