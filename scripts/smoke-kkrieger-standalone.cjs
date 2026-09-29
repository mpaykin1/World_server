'use strict';

const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('fs');

(async () => {
  const url = process.argv[2];
  const shot = process.argv[3] || 'kkrieger_smoke.png';
  if (!url) throw new Error('usage: node scripts/smoke-kkrieger-standalone.cjs <url> [screenshot.png]');

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  const severe = [];
  page.on('pageerror', (err) => severe.push(String(err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /abort|runtimeerror|fatal|segmentation|failed|error 0x/i.test(msg.text())) {
      severe.push(msg.text());
    }
  });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready', { timeout: 240000 });
  await page.click('#start');

  const deadline = Date.now() + 240000;
  let nonBlack = false;
  let metrics = null;
  while (Date.now() < deadline) {
    await page.waitForTimeout(5000);
    const buffer = await page.screenshot({ path: shot });
    const png = PNG.sync.read(buffer);
    let bright = 0;
    let sum = 0;
    const step = 16;
    let samples = 0;
    for (let y = 0; y < png.height; y += step) {
      for (let x = 0; x < png.width; x += step) {
        const i = (png.width * y + x) << 2;
        const lum = (png.data[i] + png.data[i + 1] + png.data[i + 2]) / 3;
        sum += lum;
        if (lum > 18) bright++;
        samples++;
      }
    }
    metrics = { meanLuma: sum / samples, brightFraction: bright / samples, width: png.width, height: png.height };
    if (metrics.meanLuma > 6 && metrics.brightFraction > 0.03) {
      nonBlack = true;
      break;
    }
  }

  const state = await page.evaluate(() => ({
    startOverlayPresent: Boolean(document.querySelector('#start')),
    canvasWidth: Module?.canvas?.width || 0,
    canvasHeight: Module?.canvas?.height || 0,
    recentLog: Array.isArray(window.__kkLog) ? window.__kkLog.slice(-40) : []
  }));

  await browser.close();

  const result = {
    schema: 'kkrieger-browser-smoke-v1',
    url,
    nonBlack,
    metrics,
    state,
    severeErrors: severe,
    pass: nonBlack && severe.length === 0 && !state.startOverlayPresent && state.canvasWidth > 0 && state.canvasHeight > 0
  };
  fs.writeFileSync(shot.replace(/\.png$/i, '.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exit(5);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(6);
});
