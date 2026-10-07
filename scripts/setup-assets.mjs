import {
  readFile,
  writeFile,
  mkdir,
  cp,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  await readFile(join(root, "scripts/models.json"), "utf8"),
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
await mkdir(join(root, "public/models"), { recursive: true });
for (const model of manifest) {
  const path = join(root, "public/models", model.file);
  let existing;
  try {
    existing = await readFile(path);
  } catch {}
  if (existing && hash(existing) === model.sha256) {
    console.log(`Verified ${model.file}`);
    continue;
  }
  const response = await fetch(model.url, {
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${model.file}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== model.sha256)
    throw new Error(`${model.file}: SHA-256 mismatch; asset not saved.`);
  await writeFile(path, bytes);
  console.log(`Downloaded and verified ${model.file}`);
}
const runtime = join(root, "node_modules/@mediapipe/tasks-vision");
await mkdir(join(root, "public/runtime"), { recursive: true });
await cp(
  join(runtime, "vision_bundle.js"),
  join(root, "public/runtime/vision_bundle.js"),
);
await cp(join(runtime, "wasm"), join(root, "public/runtime/wasm"), {
  recursive: true,
});
// Include actual installed dependency license text with every deployed build.
const licenses = [];
const visited = new Set();
const collect = async (path) => {
  let canonical;
  try {
    canonical = await realpath(path);
  } catch {
    return;
  }
  if (visited.has(canonical)) return;
  visited.add(canonical);
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(canonical, "package.json"), "utf8"));
  } catch {
    return;
  }
  const files = (await readdir(canonical)).filter((f) =>
    /^(licen[cs]e|copying|notice)(\.|$)/i.test(f),
  );
  let text = `\n${"=".repeat(70)}\n${pkg.name}@${pkg.version} — ${JSON.stringify(pkg.license ?? "see upstream")}\n`;
  for (const file of files)
    if ((await stat(join(canonical, file))).isFile())
      text += `\n${file}\n${await readFile(join(canonical, file), "utf8")}\n`;
  licenses.push(text);
};
const packages = join(root, "node_modules/.pnpm");
for (const entry of await readdir(packages)) {
  const modules = join(packages, entry, "node_modules");
  let children;
  try {
    children = await readdir(modules);
  } catch {
    continue;
  }
  for (const child of children) {
    if (child.startsWith("@")) {
      for (const name of await readdir(join(modules, child)))
        await collect(join(modules, child, name));
    } else await collect(join(modules, child));
  }
}
await writeFile(
  join(root, "public/licenses/dependencies.txt"),
  licenses.sort().join("\n"),
);
console.log("Self-hosted runtime and dependency notices prepared.");
