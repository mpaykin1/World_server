import fs from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const url = process.env.KK_URL || "http://127.0.0.1:8765/kkrieger_standalone.html";
const screenshotPath = process.env.KK_SCREENSHOT || "kkrieger-smoke.png";

function analyzePng(buffer) {
  const png = PNG.sync.read(buffer);
  let min = 255, max = 0, sum = 0, nonBlack = 0;
  const buckets = new Set();
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    const r = png.data[i] * a;
    const g = png.data[i + 1] * a;
    const b = png.data[i + 2] * a;
    const y = Math.round((r + g + b) / 3);
    min = Math.min(min, y);
    max = Math.max(max, y);
    sum += y;
    if (y > 4) nonBlack++;
    buckets.add(Math.round(y / 8));
  }
  const count = png.width * png.height;
  return {
    width: png.width,
    height: png.height,
    min,
    max,
    mean: sum / count,
    nonBlackRatio: nonBlack / count,
    luminanceBuckets: buckets.size,
  };
}

function rendered(pixels) {
  return pixels.luminanceBuckets >= 4 &&
    pixels.max - pixels.min >= 12 &&
    pixels.nonBlackRatio >= 0.01;
}

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", e => pageErrors.push(String(e)));

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

  const before = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    const start = document.getElementById("start");
    if (!c || !start) return null;
    const r = c.getBoundingClientRect();
    const vw = innerWidth, vh = innerHeight;
    const coverage = rect => {
      const w = Math.max(0, Math.min(rect.right, vw) - Math.max(rect.left, 0));
      const h = Math.max(0, Math.min(rect.bottom, vh) - Math.max(rect.top, 0));
      return (w * h) / (vw * vh);
    };
    return {
      canvasCoverage: coverage(r),
      startCoverage: coverage(start.getBoundingClientRect()),
      hasWebGL2: !!c.getContext("webgl2"),
    };
  });

  if (!before) throw new Error("missing start UI/canvas");
  if (!before.hasWebGL2) throw new Error("WebGL2 unavailable");
  if (before.canvasCoverage < 0.85 || before.startCoverage < 0.85) {
    throw new Error(`user visibility below 85%: ${JSON.stringify(before)}`);
  }

  await page.locator("#start").click({ timeout: 30_000 });
  await page.waitForFunction(() => !document.getElementById("start"), null, { timeout: 30_000 });

  let runtimeReady = false;
  let pixels = null;
  let screenshotBuffer = null;

  // The procedural game can spend time generating content. Validate the
  // browser compositor output rather than drawImage() from the WebGL canvas:
  // preserveDrawingBuffer is false, so reading a copied backbuffer can
  // legitimately return black after presentation even when the screen is live.
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(3_000);
    const logTail = await page.evaluate(() => (window.__kkLog || []).slice(-50));
    if (logTail.some(x => /frame|paint|engine|intro|menu|game/i.test(x))) {
      runtimeReady = true;
    }

    screenshotBuffer = await page.locator("canvas").screenshot();
    pixels = analyzePng(screenshotBuffer);
    if (runtimeReady && rendered(pixels)) break;
  }

  if (screenshotBuffer) fs.writeFileSync(screenshotPath, screenshotBuffer);

  const errors = [...consoleErrors, ...pageErrors]
    .filter(x => !/pointer lock|AudioContext|favicon/i.test(x));

  const report = {
    url,
    userVisibilityPercent: Math.round(before.canvasCoverage * 1000) / 10,
    startVisibilityPercent: Math.round(before.startCoverage * 1000) / 10,
    webgl2: before.hasWebGL2,
    runtimeReady,
    pixels,
    consoleErrors: errors.slice(0, 20),
  };

  console.log(JSON.stringify(report, null, 2));

  if (!runtimeReady) throw new Error("runtime did not produce expected game/engine log activity");
  if (!pixels || !rendered(pixels)) {
    throw new Error(`browser compositor remained blank/flat: ${JSON.stringify(pixels)}`);
  }
  if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
} finally {
  await browser.close();
}
