'use strict';

const { test, expect } = require('@playwright/test');
const { encodeApng, repairApng } = require('../lib/apng-engine');

function solid(width, height, r, g, b, a = 255) {
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const o = i * 4; out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  }
  return out;
}

function frame(rgba, delayMs = 320) {
  return { rgba, delayNum: Math.round(delayMs / 10), delayDenRaw: 100, delayMs };
}

test('normalized APNG decodes and visibly animates in the browser engine', async ({ page, browserName }) => {
  const width = 12; const height = 12;
  const source = encodeApng([
    frame(solid(width, height, 240, 30, 30)),
    frame(solid(width, height, 30, 220, 40)),
    frame(solid(width, height, 30, 60, 240))
  ], width, height);
  const repaired = repairApng(source, { temporal: false, sanitizeTransparentRgb: false }).output;
  const uri = `data:image/png;base64,${repaired.toString('base64')}`;
  await page.setContent(`<canvas id="c" width="${width}" height="${height}"></canvas><img id="i" src="${uri}">`);
  const decoded = await page.evaluate(async () => {
    const img = document.getElementById('i');
    await img.decode();
    return { width: img.naturalWidth, height: img.naturalHeight, complete: img.complete };
  });
  expect(decoded).toEqual({ width, height, complete: true });

  const colors = await page.evaluate(async () => {
    const img = document.getElementById('i'); const canvas = document.getElementById('c'); const ctx = canvas.getContext('2d');
    const seen = [];
    for (let i = 0; i < 24; i += 1) {
      ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0);
      const p = ctx.getImageData(6, 6, 1, 1).data;
      seen.push(`${p[0]},${p[1]},${p[2]},${p[3]}`);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return [...new Set(seen)];
  });
  expect(colors.length, `${browserName} must advance through at least two APNG frames`).toBeGreaterThanOrEqual(2);
});
