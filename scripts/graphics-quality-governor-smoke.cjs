#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const url = process.env.QG_URL || 'http://127.0.0.1:8788/apps/graphics-quality-governor-mvp/';
const out = process.env.QG_REPORT || path.join(process.cwd(), 'GRAPHICS_QUALITY_GOVERNOR_BROWSER_EVIDENCE.json');

function fnv(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i += 97) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

async function canvasFingerprint(page) {
  return page.locator('#gl').evaluate((canvas) => {
    const gl = canvas.getContext('webgl2');
    if (!gl) return null;
    const w = canvas.width, h = canvas.height;
    const pixels = new Uint8Array(w * h * 4);
    gl.finish();
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2166136261;
    let lit = 0, sampled = 0, edgeLike = 0;
    for (let i = 0; i < pixels.length; i += 388) {
      const r = pixels[i] || 0, g = pixels[i + 1] || 0, b = pixels[i + 2] || 0;
      const l = (r * 3 + g * 6 + b) / 10;
      if (l > 12) lit++;
      if (i >= 388) {
        const pr = pixels[i - 388] || 0, pg = pixels[i - 387] || 0, pb = pixels[i - 386] || 0;
        const pl = (pr * 3 + pg * 6 + pb) / 10;
        if (Math.abs(l - pl) > 18) edgeLike++;
      }
      hash ^= r ^ (g << 1) ^ (b << 2);
      hash = Math.imul(hash, 16777619);
      sampled++;
    }
    return {
      hash: (hash >>> 0).toString(16).padStart(8, '0'),
      litRatio: sampled ? lit / sampled : 0,
      edgeLikeRatio: sampled ? edgeLike / sampled : 0,
      width: w,
      height: h
    };
  });
}

async function runCase(browser, name, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  assert.ok(response && response.ok(), `${name}: HTTP must be 2xx`);
  await page.waitForFunction(() => window.__graphicsQualityEvidence?.runtime?.mode === 'on-demand', null, { timeout: 60000 });

  const evidence = await page.evaluate(() => window.__graphicsQualityEvidence);
  assert.ok(evidence.noticeScore >= 85, `${name}: A/B noticeability below 85`);
  for (const gate of ['NEAR_OBJECT_GATE', 'MATERIAL_GATE', 'LIGHTING_GATE', 'ENVIRONMENT_GATE']) {
    assert.equal(evidence.reports.primitive.gates[gate], false, `${name}: primitive ${gate}`);
    assert.equal(evidence.reports.krieger_class.gates[gate], true, `${name}: enhanced ${gate}`);
  }

  const rect = await page.locator('#gl').evaluate(el => {
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  const viewport = page.viewportSize();
  assert.ok(rect.width / viewport.width >= 0.99, `${name}: canvas width coverage`);
  assert.ok(rect.height / viewport.height >= 0.99, `${name}: canvas height coverage`);

  const enhanced = await canvasFingerprint(page);
  console.log(`[QG_FRAME] ${name} enhanced`, enhanced);
  assert.ok(enhanced && enhanced.litRatio > 0.25, `${name}: enhanced framebuffer too dark`);
  await page.click('#primitive');
  await page.waitForTimeout(900);
  const primitive = await canvasFingerprint(page);
  assert.equal(enhanced.width, primitive.width, `${name}: A/B framebuffer width changed`);
  assert.equal(enhanced.height, primitive.height, `${name}: A/B framebuffer height changed`);
  assert.notEqual(enhanced.hash, primitive.hash, `${name}: A/B changed label but not framebuffer`);
  await page.click('#enhanced');
  await page.waitForTimeout(900);
  const enhancedAgain = await canvasFingerprint(page);
  assert.equal(enhanced.hash, enhancedAgain.hash, `${name}: same deterministic enhanced frame changed unexpectedly`);

  const result = {
    name,
    http: response.status(),
    errors,
    viewport,
    canvas: rect,
    noticeability: evidence.noticeScore,
    primitiveFingerprint: primitive,
    enhancedFingerprint: enhanced,
    runtime: evidence.runtime
  };
  assert.deepEqual(errors, [], `${name}: console/page errors`);
  await context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    results.push(await runCase(browser, 'portrait-mobile', {
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true
    }));
    results.push(await runCase(browser, 'desktop', {
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1
    }));
    const report = { generatedAt: new Date().toISOString(), url, pass: true, results };
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => {
  const report = { generatedAt: new Date().toISOString(), url, pass: false, error: String(error.stack || error) };
  try { fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n'); } catch {}
  console.error(report.error);
  process.exit(1);
});
