/* Copyright (c) 2026 Tarang Jammalamadaka. All rights reserved. */
// Manual check, not part of CI: run Objects' three detectors by themselves in
// a real browser, on the same pictures, and report what each loaded, how long
// a frame takes and what it found. The browser tests run with the GPU off, so
// this is the check of the Sharper model's GPU path.
//   node scripts/detector-check.mjs [hardware|software] [out folder] [picture ...]
//   node scripts/detector-check.mjs hardware /tmp/frames ~/Pictures/desk.png
// It serves public/ itself on a port the system picks and stops when done.
// The demo stills are always run; further pictures are added by path. With an
// out folder, every picture is saved once per model with its boxes drawn.
// "hardware" opens the installed Chrome on the real GPU; "software" with the
// GPU off, as the browser tests do, where Sharper must refuse to start.
// SHARPER_SIZE and SHARPER_MIN_SCORE try another input size or score floor
// for the Sharper model than the ones the app ships with.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../public"),
  hardware = (process.argv[2] ?? "hardware") === "hardware",
  out = process.argv[3] ? resolve(process.argv[3]) : null,
  extra = process.argv.slice(4).map((path) => resolve(path)),
  // The Confidence slider's value when the app opens.
  CONFIDENCE = 0.45,
  FRAMES = 30,
  tuning = {
    ...(process.env.SHARPER_SIZE && { size: Number(process.env.SHARPER_SIZE) }),
    ...(process.env.SHARPER_MIN_SCORE && {
      minScore: Number(process.env.SHARPER_MIN_SCORE),
    }),
  };
const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".html": "text/html",
};
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, "http://x").pathname);
  try {
    const picture = /^\/extra\/(\d+)$/.exec(path),
      file = picture ? extra[Number(picture[1])] : join(root, path);
    if (!file || (!picture && !file.startsWith(root))) throw new Error("no");
    // The page itself is empty: everything runs in workers started from it.
    const body = path === "/" ? "<!doctype html>" : await readFile(file);
    response.writeHead(200, {
      "content-type":
        path === "/"
          ? "text/html"
          : (TYPES[extname(file)] ?? "application/octet-stream"),
    });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/`;

const MODELS = [
  {
    name: "lite0",
    worker: "vision-worker.js",
    file: "efficientdet_lite0.tflite",
  },
  {
    name: "lite2",
    worker: "vision-worker.js",
    file: "efficientdet_lite2.tflite",
  },
  {
    name: "sharper",
    worker: "detector-worker.js",
    file: "dfine_s_coco.onnx",
    options: tuning,
  },
];
const pictures = [
  ...["studio", "face", "hands", "face-and-hands"].map((name) => ({
    name,
    url: `${base}demo/${name}.png`,
  })),
  ...extra.map((path, index) => ({
    name: basename(path, extname(path)),
    url: `${base}extra/${index}`,
  })),
];

const browser = await chromium.launch({
  channel: "chrome",
  args: hardware
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--disable-gpu", "--use-angle=swiftshader"],
});
try {
  const page = await browser.newPage();
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      console.log(`[browser ${message.type()}] ${message.text()}`);
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  console.log("Chrome", browser.version());
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
  for (const model of MODELS) {
    const report = await page.evaluate(
      async ({ base, model, pictures, confidence, frames, draw }) => {
        const worker = new Worker(`${base}${model.worker}`),
          started = performance.now(),
          next = () =>
            new Promise((resolve, reject) => {
              worker.onmessage = (event) => resolve(event.data);
              worker.onerror = (event) => reject(new Error(event.message));
            });
        worker.postMessage({
          type: "init",
          base,
          task: {
            kind: "object",
            model: model.file,
            options: { scoreThreshold: 0.1, maxResults: 20, ...model.options },
            delegate: "GPU",
          },
        });
        let message = await next();
        while (message.type === "progress" || message.type === "downloaded")
          message = await next();
        if (message.type !== "ready") {
          worker.terminate();
          return { failed: message };
        }
        const out = {
          readyMs: Math.round(performance.now() - started),
          files: message.files,
          found: {},
          frames: {},
        };
        let time = 0;
        const ask = async (image) => {
          const bitmap = await createImageBitmap(image),
            sent = performance.now();
          worker.postMessage(
            {
              type: "frame",
              bitmap,
              time: (time += 100),
              generation: 1,
              confidence,
            },
            [bitmap],
          );
          const answer = await next();
          if (answer.type !== "result") throw new Error(answer.error);
          return { ...answer.result, wall: performance.now() - sent };
        };
        for (const picture of pictures) {
          const image = new Image();
          image.src = picture.url;
          await image.decode();
          // The first passes of a model are slow ones: not counted.
          if (picture === pictures[0]) {
            for (let i = 0; i < 3; i++) await ask(image);
            const runs = [];
            for (let i = 0; i < frames; i++) runs.push(await ask(image));
            const middle = (values) =>
              Math.round([...values].sort((a, b) => a - b)[values.length >> 1]);
            out.medianMs = middle(runs.map((r) => r.latency));
            out.medianWallMs = middle(runs.map((r) => r.wall));
          }
          const result = await ask(image);
          out.found[picture.name] = result.detections.map(
            (d) =>
              `${d.label} ${Math.round(d.score * 100)}% at ${[d.box.x, d.box.y, d.box.w, d.box.h].map((v) => v.toFixed(2)).join(",")}`,
          );
          if (!draw) continue;
          // The picture at 1280 wide with every box and its label drawn.
          const scale = 1280 / image.naturalWidth,
            canvas = document.createElement("canvas"),
            ctx = canvas.getContext("2d");
          canvas.width = 1280;
          canvas.height = Math.round(image.naturalHeight * scale);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          ctx.lineWidth = 3;
          ctx.font = "bold 18px sans-serif";
          result.detections.forEach((d, index) => {
            const x = d.box.x * canvas.width,
              y = d.box.y * canvas.height,
              text = `${index + 1} ${d.label} ${Math.round(d.score * 100)}%`;
            ctx.strokeStyle =
              ctx.fillStyle = `hsl(${(index * 67) % 360} 90% 45%)`;
            ctx.strokeRect(
              x,
              y,
              d.box.w * canvas.width,
              d.box.h * canvas.height,
            );
            ctx.fillRect(x, y, ctx.measureText(text).width + 8, 22);
            ctx.fillStyle = "#fff";
            ctx.fillText(text, x + 4, y + 17);
          });
          out.frames[picture.name] = canvas
            .toDataURL("image/png")
            .split(",")[1];
        }
        worker.terminate();
        return out;
      },
      {
        base,
        model,
        pictures,
        confidence: CONFIDENCE,
        frames: FRAMES,
        draw: !!out,
      },
    );
    const { frames = {}, ...printed } = report;
    console.log(
      JSON.stringify(
        { model: model.name, file: model.file, ...printed },
        null,
        1,
      ),
    );
    if (out) {
      await mkdir(out, { recursive: true });
      for (const [name, data] of Object.entries(frames))
        await writeFile(
          join(out, `${name}-${model.name}.png`),
          Buffer.from(data, "base64"),
        );
    }
  }
} finally {
  await browser.close();
  server.close();
}
