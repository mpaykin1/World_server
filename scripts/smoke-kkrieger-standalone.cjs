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
    args: ['--use-gl=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
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

  // Do not mistake the procedural-generation progress bar for a playable frame.
  await page.waitForFunction(
    () => Array.isArray(window.__kkLog) && window.__kkLog.some((line) => /generation finished in/i.test(line)),
    { timeout: 360000 }
  );

  // The 2004 game starts with intro/menu roots. Drive the same Enter path used
  // by upstream's headless smoke until the playable level has had time to render.
  await page.locator('#canvas').click({ position: { x: 640, y: 480 } }).catch(() => {});
  await page.waitForTimeout(12000);
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
  }
  await page.waitForTimeout(8000);

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
  const metrics = { meanLuma: sum / samples, brightFraction: bright / samples, width: png.width, height: png.height };
  const nonBlack = metrics.meanLuma > 6 && metrics.brightFraction > 0.03;

  const state = await page.evaluate(() => ({
    startOverlayPresent: Boolean(document.querySelector('#start')),
    canvasWidth: Module?.canvas?.width || 0,
    canvasHeight: Module?.canvas?.height || 0,
    generationFinished: Array.isArray(window.__kkLog) && window.__kkLog.some((line) => /generation finished in/i.test(line)),
    playableRootSeen: Array.isArray(window.__kkLog) && window.__kkLog.some((line) => /CurrentRoot=2|paint: CurrentRoot=2/i.test(line)),
    recentLog: Array.isArray(window.__kkLog) ? window.__kkLog.slice(-60) : []
  }));

  await browser.close();

  const result = {
    schema: 'kkrieger-browser-smoke-v1',
    url,
    generationFinished: state.generationFinished,
    playableRootSeen: state.playableRootSeen,
    nonBlack,
    metrics,
    state,
    severeErrors: severe,
    pass: state.generationFinished && state.playableRootSeen && nonBlack && severe.length === 0 && !state.startOverlayPresent && state.canvasWidth > 0 && state.canvasHeight > 0
  };
  fs.writeFileSync(shot.replace(/\.png$/i, '.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exit(5);
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(6);
});
