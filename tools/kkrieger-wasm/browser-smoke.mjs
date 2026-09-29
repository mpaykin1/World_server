import { chromium } from "playwright";

const url = process.env.KK_URL || "http://127.0.0.1:8765/kkrieger_standalone.html";
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

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
  const visibleW = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
  const visibleH = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  return {
    canvasCoverage: (visibleW * visibleH) / (vw * vh),
    startCoverage: (() => {
      const s = start.getBoundingClientRect();
      const sw = Math.max(0, Math.min(s.right, vw) - Math.max(s.left, 0));
      const sh = Math.max(0, Math.min(s.bottom, vh) - Math.max(s.top, 0));
      return (sw * sh) / (vw * vh);
    })(),
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
for (let i = 0; i < 18; i++) {
  await page.waitForTimeout(5_000);
  const state = await page.evaluate(() => ({
    logTail: (window.__kkLog || []).slice(-30),
    canvasW: document.querySelector("canvas")?.width || 0,
    canvasH: document.querySelector("canvas")?.height || 0,
  }));
  if (state.logTail.some(x => /frame|paint|engine|intro|menu|game/i.test(x))) {
    runtimeReady = true;
    break;
  }
}

const pixels = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  const copy = document.createElement("canvas");
  copy.width = 96; copy.height = 64;
  const ctx = copy.getContext("2d", { willReadFrequently: true });
  try { ctx.drawImage(c, 0, 0, copy.width, copy.height); } catch {}
  const d = ctx.getImageData(0, 0, copy.width, copy.height).data;
  let min = 255, max = 0, sum = 0, nonBlack = 0;
  const buckets = new Set();
  for (let i = 0; i < d.length; i += 4) {
    const y = Math.round((d[i] + d[i+1] + d[i+2]) / 3);
    min = Math.min(min, y); max = Math.max(max, y); sum += y;
    if (y > 4) nonBlack++;
    buckets.add(Math.round(y / 8));
  }
  return {
    min, max,
    mean: sum / (d.length / 4),
    nonBlackRatio: nonBlack / (d.length / 4),
    luminanceBuckets: buckets.size,
  };
});

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

await page.screenshot({ path: process.env.KK_SCREENSHOT || "kkrieger-smoke.png", fullPage: true });
await browser.close();

if (!runtimeReady) throw new Error("runtime did not produce expected game/engine log activity");
if (pixels.luminanceBuckets < 4 || pixels.max - pixels.min < 12 || pixels.nonBlackRatio < 0.01) {
  throw new Error(`render appears blank/flat: ${JSON.stringify(pixels)}`);
}
if (errors.length) throw new Error(`browser errors: ${errors.join(" | ")}`);
