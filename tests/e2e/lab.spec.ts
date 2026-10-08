import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { BenchReport } from "../../src/panels/lab/benchmark-report";

type Catalogue = { file: string; sha256: string }[];
const catalogue = async () =>
  JSON.parse(
    await readFile(resolve("scripts/models.json"), "utf8"),
  ) as Catalogue;

// The GPU delegate is exercised only on request (SPECTRA_TEST_GPU=1). On a
// software renderer under load, one GPU start can keep the browser's GPU
// process busy for a minute, which stalls every later step of a test. The
// decision logic and the restart path are covered by tests/lab-delegate.test.ts.
const withGpu = process.env.SPECTRA_TEST_GPU === "1";

// Counts vision workers, so a leaked one shows up as a number.
async function watchWorkers(page: Page) {
  await page.addInitScript(() => {
    // First-run coach marks would cover the rail; mark them as seen.
    try {
      localStorage.setItem("spectra.coach.v1", "1");
    } catch {
      /* Storage blocked: the test then deals with whatever is shown. */
    }
    const count = { created: 0, alive: 0 };
    Object.assign(window, { spectraWorkers: count });
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        count.created++;
        count.alive++;
      }
      terminate() {
        count.alive--;
        super.terminate();
      }
    };
  });
}
const workers = (page: Page) =>
  page.evaluate(
    () =>
      (
        window as unknown as {
          spectraWorkers: { created: number; alive: number };
        }
      ).spectraWorkers,
  );
async function openLab(page: Page) {
  await page.goto("./", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await page.getByRole("button", { name: "Lab", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lab" })).toBeVisible();
}
const number = async (page: Page, id: string) =>
  Number(await page.getByTestId(id).textContent());
const tab = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: true });

test("lab shows measured, ordered latency figures, charts and model cards on the demo input", async ({
  page,
}) => {
  await watchWorkers(page);
  await openLab(page);
  // Figures appear only once real samples exist.
  await expect
    .poll(() => number(page, "lab-count-object"), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(8);
  const p50 = await number(page, "lab-p50-object"),
    p95 = await number(page, "lab-p95-object"),
    max = await number(page, "lab-max-object");
  for (const value of [p50, p95, max]) {
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(0);
  }
  expect(p50).toBeLessThanOrEqual(p95);
  expect(p95).toBeLessThanOrEqual(max);
  await expect.poll(() => number(page, "lab-processed-fps")).toBeGreaterThan(0);
  // The app caps inference at one result per 65 ms.
  expect(await number(page, "lab-processed-fps")).toBeLessThan(16);
  expect(await number(page, "lab-render-fps")).toBeGreaterThan(1);
  expect(await number(page, "lab-dropped")).toBeGreaterThanOrEqual(0);
  await expect(page.getByTestId("lab-delegate-object")).toHaveText(
    "Running on CPU.",
  );
  await expect(page.getByTestId("lab-cost")).toHaveText(
    /mean \d+\.\d+ ms, worst \d+\.\d+ ms/,
  );
  // Both charts were really drawn: they hold pixels that are not blank.
  const inked = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLCanvasElement>(".lab-block canvas")].map(
      (canvas) => {
        const data = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let ink = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i]) ink++;
        return ink;
      },
    ),
  );
  expect(inked).toHaveLength(2);
  for (const ink of inked) expect(ink).toBeGreaterThan(200);
  // Load times are on record for the mode in use and absent for the others.
  const loads = page.getByTestId("lab-loads");
  await expect(loads.getByRole("row", { name: /Objects/ })).toHaveText(
    /Objects\d+ ms\d+ ms/,
  );
  await expect(loads.getByRole("row", { name: /Body/ })).toContainText(
    "not loaded",
  );
  // The model card carries the hash recorded in scripts/models.json.
  const model = (await catalogue()).find(
    (m) => m.file === "efficientdet_lite0.tflite",
  )!;
  const card = page.getByTestId("lab-model-object");
  await expect(card).toContainText("efficientdet_lite0.tflite");
  await expect(card).toContainText(model.sha256);
  await expect(card).toContainText("Apache-2.0");
  await expect(card).toContainText("7.25 MB");
  expect((await workers(page)).alive).toBe(1);
});

test("delegate switch restarts the task, reports the delegate truthfully and leaves one worker", async ({
  page,
}) => {
  test.skip(!withGpu, "GPU delegate runs only with SPECTRA_TEST_GPU=1");
  // A software GPU can take its whole start bound before the fallback.
  test.setTimeout(300_000);
  await watchWorkers(page);
  await openLab(page);
  await tab(page, "Hands").click();
  const line = page.getByTestId("lab-delegate-hand"),
    cpu = page.getByRole("button", { name: "Run hand on CPU" }),
    gpu = page.getByRole("button", { name: "Run hand on GPU" });
  await expect(cpu).toHaveAttribute("aria-pressed", "true");
  await expect(line).toHaveText("Running on CPU.");
  await gpu.click();
  await expect(gpu).toHaveAttribute("aria-pressed", "true");
  // Either GPU really runs, or the fallback is spelled out. Never silence.
  await expect(line).toHaveText(
    /^(Running on GPU\.|GPU was requested but .+ Running on CPU\.)$/,
    { timeout: 150_000 },
  );
  await expect
    .poll(() => number(page, "lab-count-hand"), { timeout: 60_000 })
    .toBeGreaterThanOrEqual(3);
  const p50 = await number(page, "lab-p50-hand");
  expect(p50).toBeGreaterThan(0);
  expect(p50).toBeLessThanOrEqual(await number(page, "lab-max-hand"));
  expect((await workers(page)).alive).toBe(1);
  await cpu.click();
  await expect(line).toHaveText("Running on CPU.", { timeout: 150_000 });
  expect((await workers(page)).alive).toBe(1);
  // Leaving the Lab and coming back keeps one worker and the same mode.
  await tab(page, "Inspect").click();
  await expect(page.getByRole("heading", { name: "Lab" })).toHaveCount(0);
  await tab(page, "Lab").click();
  await expect(line).toHaveText("Running on CPU.");
  await expect(tab(page, "Hands")).toHaveAttribute("aria-pressed", "true");
  expect((await workers(page)).alive).toBe(1);
});

test("shortened benchmark exports reproducible JSON and Markdown and restores the app", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await watchWorkers(page);
  await page.addInitScript(() => {
    Object.assign(window, {
      __spectraLabTest: { measureMs: 2500, warmupMs: 400 },
    });
  });
  await openLab(page);
  // Benchmark a mode other than the one on show, so the run has to switch
  // mode and put it back.
  await page.getByRole("checkbox", { name: "Objects" }).uncheck();
  await page.getByRole("checkbox", { name: "Hands" }).check();
  if (!withGpu) await page.getByRole("checkbox", { name: "GPU" }).uncheck();
  const delegates = withGpu ? ["CPU", "GPU"] : ["CPU"];
  await page.getByRole("button", { name: "Run benchmark" }).click();
  await expect(
    page.getByRole("button", { name: "Stop benchmark" }),
  ).toBeVisible();
  await expect(page.getByTestId("lab-progress")).toHaveText(
    `Finished ${delegates.length} runs.`,
    { timeout: 200_000 },
  );
  await expect(page.getByTestId("lab-results").locator("tbody tr")).toHaveCount(
    delegates.length,
  );

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const jsonFile = await jsonDownload;
  expect(jsonFile.suggestedFilename()).toBe("spectra-benchmark.json");
  const report: BenchReport = JSON.parse(
    await readFile((await jsonFile.path())!, "utf8"),
  );
  expect(report).toMatchObject({
    app: "SPECTRA",
    kind: "benchmark",
    schema: 1,
    protocol: { measureMs: 2500, warmupMs: 400, shortened: true },
  });
  expect(Date.parse(report.startedAt)).not.toBeNaN();
  expect(report.protocol.inferenceCapFps).toBeCloseTo(15.4, 1);
  expect(report.device.userAgent).toContain("Chrome/");
  expect(report.device.browser).toMatch(/^Chrome \d+\./);
  expect(typeof report.device.platform).toBe("string");
  expect(typeof report.device.gpu).toBe("string");
  expect(report.device.gpu.length).toBeGreaterThan(0);
  expect(report.canvas!.width).toBeGreaterThan(100);
  expect(report.canvas!.height).toBeGreaterThan(100);
  expect(report.canvas!.dpr).toBeGreaterThan(0);
  const models = await catalogue();
  const expected = delegates.map((delegate) => [
    "hands",
    delegate,
    "hand",
    "hand_landmarker.task",
  ]);
  expect(report.rows).toHaveLength(delegates.length);
  report.rows.forEach((row, index) => {
    const [mode, delegate, kind, file] = expected[index],
      task = row.tasks[0];
    expect(row).toMatchObject({
      mode,
      delegateRequested: delegate,
      status: "ok",
      measuredMs: 2500,
    });
    expect(row.source).toMatchObject({ kind: "demo" });
    expect(row.tasks).toHaveLength(1);
    expect(task).toMatchObject({
      kind,
      model: file,
      sha256: models.find((m) => m.file === file)!.sha256,
      sha256Matches: true,
      delegateRequested: delegate,
    });
    // CPU must run on CPU. GPU runs on GPU or says why it did not.
    if (delegate === "CPU") expect(task.delegateActive).toBe("CPU");
    else if (task.delegateActive === "CPU")
      expect(task.delegateNote).toMatch(/GPU was requested but/);
    else expect(task.delegateActive).toBe("GPU");
    expect(task.loadMs).toBeGreaterThan(0);
    expect(task.samples).toBeGreaterThan(2);
    for (const value of [task.p50, task.p95, task.max])
      expect(Number.isFinite(value)).toBe(true);
    expect(task.p50).toBeGreaterThan(0);
    expect(task.p50).toBeLessThanOrEqual(task.p95!);
    expect(task.p95).toBeLessThanOrEqual(task.max!);
    // FPS is the sample count over the measuring period, nothing else.
    expect(row.processedFps).toBeCloseTo(task.samples / 2.5, 6);
    expect(row.processedFps).toBeLessThan(16);
    expect(row.renderFps).toBeGreaterThan(1);
    expect(row.droppedFrames).toBeGreaterThanOrEqual(0);
  });

  const mdDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Markdown" }).click();
  const mdFile = await mdDownload;
  expect(mdFile.suggestedFilename()).toBe("spectra-benchmark.md");
  const md = await readFile((await mdFile.path())!, "utf8");
  expect(md).toContain("# SPECTRA benchmark");
  expect(md).toContain(`- Device: ${report.device.userAgent}`);
  expect(md).toContain("SHORTENED TEST RUN");
  // Header, separator and one line per run.
  expect(md.split("\n").filter((l) => l.startsWith("| "))).toHaveLength(
    delegates.length + 2,
  );
  expect(md).toContain("hand_landmarker.task");
  expect(md).toContain("(matches record)");

  // The benchmark put everything back: mode, delegate choice, one worker.
  await expect(tab(page, "Objects")).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Run object on CPU" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("lab-delegate-object")).toHaveText(
    "Running on CPU.",
  );
  await expect(page.getByRole("checkbox", { name: "Hands" })).toBeEnabled();
  await expect(page.getByTestId("latency")).toHaveText(/^\d+ ms$/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect((await workers(page)).alive).toBe(1);
});
