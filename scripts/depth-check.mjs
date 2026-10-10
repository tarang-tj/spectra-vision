/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Manual check, not part of CI: run the Depth worker by itself in a real
// browser and report what it loaded and how long a frame takes.
//   node scripts/depth-check.mjs [url] [CPU|GPU] [sizes] [hardware|software]
//   node scripts/depth-check.mjs http://127.0.0.1:5184/ GPU 518 hardware
// `sizes` is a comma separated list of input sizes (the side the picture is
// resized toward). Both open the installed Chrome: "hardware" on the real GPU,
// which WebGPU needs, "software" with the GPU off, as the browser tests do.
import { chromium } from "@playwright/test";

const url = process.argv[2] ?? "http://127.0.0.1:5173/",
  delegate = process.argv[3] ?? "CPU",
  sizes = (process.argv[4] ?? "252").split(",").map(Number),
  hardware = (process.argv[5] ?? "hardware") === "hardware";
const browser = await chromium.launch({
  channel: "chrome",
  args: hardware
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--disable-gpu", "--use-angle=swiftshader"],
});
const page = await browser.newPage();
const requests = [];
page.on("requestfinished", async (request) => {
  const address = request.url();
  if (!/runtime\/ort|models\/depth/.test(address)) return;
  const sizes = await request.sizes().catch(() => null);
  requests.push(
    `${address.replace(url, "")} ${sizes ? sizes.responseBodySize : "?"}`,
  );
});
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning")
    console.log(`[browser ${message.type()}] ${message.text()}`);
});
await page.goto(url, { waitUntil: "domcontentloaded" });
// Which GPU WebGPU would use here, as the browser names it.
console.log(
  "WebGPU adapter:",
  await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter(),
      info = adapter?.info;
    return info
      ? `${info.vendor} ${info.architecture} ${info.description}${info.isFallbackAdapter ? " (fallback adapter)" : ""}`
      : "none";
  }),
);
for (const size of sizes) {
  const report = await page.evaluate(
    async ({ delegate, size, frames }) => {
      const base = new URL("./", location.href).href,
        image = new Image();
      image.src = `${base}demo/studio.png`;
      await image.decode();
      const worker = new Worker(`${base}depth-worker.js`),
        started = performance.now(),
        out = {
          isolated: crossOriginIsolated,
          webgpu: "gpu" in navigator,
          source: `${image.naturalWidth} x ${image.naturalHeight}`,
        };
      const next = () =>
        new Promise((resolve, reject) => {
          worker.onmessage = (event) => resolve(event.data);
          worker.onerror = (event) => reject(new Error(event.message));
        });
      worker.postMessage({
        type: "init",
        base,
        task: {
          kind: "depth",
          model: "depth_anything_v2_small.onnx",
          options: { size: { [delegate]: size } },
          delegate,
        },
      });
      let message = await next();
      if (message.type === "downloaded") {
        out.downloadMs = Math.round(performance.now() - started);
        message = await next();
      }
      if (message.type !== "ready") return { ...out, failed: message };
      out.readyMs = Math.round(performance.now() - started);
      out.files = message.files;
      out.names = message.names;
      out.latency = [];
      for (let i = 0; i < frames; i++) {
        const bitmap = await createImageBitmap(image);
        worker.postMessage(
          { type: "frame", bitmap, time: i * 100, generation: 1 },
          [bitmap],
        );
        message = await next();
        if (message.type !== "result") return { ...out, failed: message };
        const { extra, latency } = message.result,
          at = (x, y) =>
            extra.values[
              Math.floor(y * extra.height) * extra.width +
                Math.floor(x * extra.width)
            ];
        out.latency.push(Math.round(latency));
        out.map = `${extra.width} x ${extra.height}`;
        out.range = [extra.min, extra.max];
        // Inverse depth: the floor at the front must read larger than the
        // back wall.
        out.floorFront = at(0.3, 0.95);
        out.person = at(0.5, 0.4);
        out.backWall = at(0.45, 0.12);
      }
      worker.terminate();
      return out;
    },
    { delegate, size, frames: 6 },
  );
  console.log(JSON.stringify({ delegate, size, ...report }, null, 1));
}
console.log("Requests:\n  " + [...new Set(requests)].join("\n  "));
await browser.close();
