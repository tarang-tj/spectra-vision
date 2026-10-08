// Temporary screenshot driver for the shell lane. Deleted before finishing.
import { chromium } from "@playwright/test";
const out = process.env.SHOT_DIR,
  url = "http://127.0.0.1:5185/";
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const sizes = { d: [1536, 1024], l: [1280, 720], m: [390, 844] };
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  args: [
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
  ],
});
for (const [key, [width, height]] of Object.entries(sizes)) {
  if (only.length && !only.some((o) => o.startsWith(key))) continue;
  const want = (name) =>
    !only.length || only.includes(`${key}:${name}`) || only.includes(key);
  const context = await browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const shot = async (name, full = false) => {
    if (!want(name)) return;
    await page.screenshot({
      path: `${out}/${key}-${name}.png`,
      fullPage: full,
    });
  };
  const ready = () =>
    page
      .getByTestId("latency")
      .filter({ hasText: /^\d+ ms$/ })
      .waitFor({ timeout: 60000 });
  await page.goto(url);
  await ready();
  await shot("coach");
  await page.getByRole("button", { name: "Close tips" }).click();
  await shot("main", key === "m");
  await page.getByRole("switch").first().focus();
  await page.getByRole("switch", { name: "Constellation" }).click();
  await page.waitForTimeout(400);
  await shot("tray", key === "m");
  await page.getByRole("switch", { name: "Constellation" }).click();
  const games = page.getByRole("button", { name: /^\d+ games?$/ });
  if (await games.count()) {
    await games.click();
    await page.waitForTimeout(300);
    await shot("play", key === "m");
  }
  const lab = page.getByRole("button", { name: "Lab", exact: true });
  if (await lab.count()) {
    await lab.click();
    await page.waitForTimeout(1200);
    await shot("lab", key === "m");
  }
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(200);
  await shot("palette");
  await page.keyboard.type("ha");
  await shot("palette-filter");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Immersive" }).click();
  await page.waitForTimeout(500);
  await shot("immersive");
  await page.getByRole("button", { name: "Effects" }).click();
  await shot("immersive-effects");
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await page.waitForTimeout(300);
  await shot("help", true);
  await page.keyboard.press("?");
  await page.getByRole("button", { name: "Hands", exact: true }).click();
  await ready();
  for (const sw of (await page.getByRole("switch").all()).slice(0, key === "d" ? 20 : 4)) if ((await sw.getAttribute("aria-checked")) === "false") await sw.click();
  await page.waitForTimeout(1500);
  await shot("tray-full", key === "m");
  for (const sw of await page.getByRole("switch").all()) if ((await sw.getAttribute("aria-label")) !== "Trails" && (await sw.getAttribute("aria-checked")) === "true") await sw.click();
  await page.keyboard.press("r");
  await page.waitForTimeout(1500);
  await page.keyboard.press("r");
  await page.getByRole("region", { name: "Your result" }).waitFor();
  await page.waitForTimeout(600);
  await page.getByRole("region", { name: "Your result" }).scrollIntoViewIfNeeded();
  await shot("share", key === "m");
  const slice = page.getByRole("button", { name: "Play Slice" });
  if (await page.getByRole("button", { name: /^\d+ games?$/ }).count()) {
    await page.getByRole("button", { name: /^\d+ games?$/ }).click();
    await slice.click();
    await page.waitForTimeout(5000);
    await shot("game", key === "m");
    await page.getByRole("button", { name: "Stop Slice" }).click();
    await page.waitForTimeout(400);
    await shot("score", key === "m");
  }
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); }; });
  await page.getByRole("button", { name: "Start camera" }).click();
  await page.getByRole("alert").waitFor();
  await page.getByRole("alert").scrollIntoViewIfNeeded();
  await shot("denied");
  console.log(key, "errors:", JSON.stringify(errors.slice(0, 6)));
  await context.close();
}
await browser.close();
