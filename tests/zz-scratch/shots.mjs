// Scratch: screenshots of the production preview. Deleted before the gate.
import { chromium } from "@playwright/test";
const out = process.argv[2];
const url = "http://127.0.0.1:5173/spectra-vision/";
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: ["--use-angle=metal", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const logs = [];
async function open(viewport, coach = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" && !/^INFO: /.test(m.text())) logs.push(`console.error: ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  if (!coach) await page.addInitScript(() => localStorage.setItem("spectra.coach.v1", "1"));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 60000 });
  return page;
}
const ready = (page) => page.getByTestId("latency").filter({ hasText: /^\d+ ms$/ }).waitFor({ timeout: 60000 });
const mode = async (page, name) => {
  await page.getByRole("navigation", { name: "Vision mode" }).getByRole("button", { name, exact: true }).click();
  await ready(page);
  await page.waitForTimeout(1800);
};
const which = process.argv[3] ?? "all";
if (which === "all" || which === "modes") {
  const page = await open({ width: 1536, height: 1024 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/mode-objects.png` });
  for (const name of ["Body", "Hands", "Face", "Segment", "Gestures", "Fusion"]) {
    await mode(page, name);
    await page.screenshot({ path: `${out}/mode-${name.toLowerCase()}.png` });
  }
  await page.context().close();
}
if (which === "all" || which === "effects") {
  const page = await open({ width: 1536, height: 1024 });
  await mode(page, "Hands");
  await page.getByRole("switch", { name: "Plasma hands" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/effect-plasma.png` });
  await page.getByRole("switch", { name: "Plasma hands" }).click();
  await mode(page, "Body");
  await page.getByRole("switch", { name: "Aura" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/effect-aura.png` });
  await page.getByRole("switch", { name: "Aura" }).click();
  await mode(page, "Segment");
  await page.getByRole("switch", { name: "Hologram" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/effect-hologram.png` });
  await page.context().close();
}
if (which === "all" || which === "lab") {
  const page = await open({ width: 1536, height: 1024 });
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${out}/lab.png` });
  await page.context().close();
}
if (which === "all" || which === "immersive") {
  const page = await open({ width: 1536, height: 1024 });
  await mode(page, "Hands");
  await page.getByRole("button", { name: "Immersive" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/immersive.png` });
  await page.context().close();
}
if (which === "all" || which === "phone") {
  let page = await open({ width: 390, height: 844 }, true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/phone-coach.png` });
  await page.context().close();
  page = await open({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/phone-full.png`, fullPage: true });
  await page.context().close();
  page = await open({ width: 1536, height: 1024 }, true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${out}/desktop-coach.png` });
  await page.context().close();
}
console.log(logs.length ? logs.join("\n") : "no console errors or page errors");
await browser.close();
