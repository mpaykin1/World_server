#!/usr/bin/env node
'use strict';
const { chromium } = require('playwright');

const base = (process.env.SENTRY_PROD_URL || process.env.QUALITY_BASE_URL || process.argv[2] || '').replace(/\/$/, '');
if (!base) {
  console.error('Usage: node scripts/verify-sentry-production.js <production-url>');
  console.error(' or set SENTRY_PROD_URL / QUALITY_BASE_URL env var');
  process.exit(2);
}

const APPS = ['/apps/ai3d-voxel-city/', '/apps/catalog/', '/apps/voxel-world/'];
const TEST_MESSAGE = 'WORLD_SERVER_SENTRY_TEST';

async function main() {
  console.log(`[SENTRY_PROD_VERIFY] base=${base}`);
  // 1) static: fetch sentry-runtime.js
  try {
    const r = await fetch(base + '/shared/sentry-runtime.js', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (!text.includes('WorldServerSentry')) throw new Error('missing WorldServerSentry');
    if (!text.includes('ingest.de.sentry.io')) throw new Error('missing ingest domain');
    console.log(`[SENTRY_PROD_VERIFY] /shared/sentry-runtime.js OK ${text.length} bytes`);
  } catch (e) {
    console.error(`[SENTRY_PROD_VERIFY] FAIL static sentry-runtime.js: ${e.message}`);
    process.exit(20);
  }

  // 2) static: check app html contains marker
  for (const p of APPS) {
    try {
      const r = await fetch(base + p, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const html = await r.text();
      if (!html.includes('/shared/sentry-runtime.js')) throw new Error('missing script tag');
      console.log(`[SENTRY_PROD_VERIFY] ${p} marker OK`);
    } catch (e) {
      console.error(`[SENTRY_PROD_VERIFY] FAIL marker ${p}: ${e.message}`);
      process.exit(20);
    }
  }

  // 3) runtime: Playwright browser check
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    for (const appPath of APPS) {
      const url = base + appPath;
      const context = await browser.newContext();
      const page = await context.newPage();
      let ingestHit = false;
      await page.route('**ingest.de.sentry.io**', async (route) => {
        ingestHit = true;
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });
      const failed = [];
      page.on('requestfailed', (req) => {
        if (req.url().includes('sentry-runtime')) failed.push(req.url());
      });
      console.log(`[SENTRY_PROD_VERIFY] goto ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const hasSentry = await page.evaluate(() => typeof window.WorldServerSentry !== 'undefined');
      if (!hasSentry) throw new Error(`${appPath} missing window.WorldServerSentry`);
      if (failed.length) throw new Error(`${appPath} sentry-runtime load failed: ${failed.join(',')}`);
      const shape = await page.evaluate(() => {
        const s = window.WorldServerSentry;
        return { hasCaptureMessage: typeof s.captureMessage === 'function' };
      });
      if (!shape.hasCaptureMessage) throw new Error(`${appPath} missing captureMessage`);
      // trigger ingest
      ingestHit = false;
      const reqPromise = page.waitForRequest((req) => req.url().includes('ingest.de.sentry.io'), { timeout: 10000 }).catch(() => null);
      await page.evaluate((msg) => window.WorldServerSentry.captureMessage(msg), TEST_MESSAGE);
      await reqPromise;
      await page.waitForTimeout(1000);
      if (!ingestHit) throw new Error(`${appPath} ingest not triggered after captureMessage`);
      console.log(`[SENTRY_PROD_VERIFY] ${appPath} runtime PASS (WorldServerSentry + ingest 200)`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log('[SENTRY_PROD_VERIFY] PASS all production runtime checks');
}

main().catch((e) => {
  console.error('[SENTRY_PROD_VERIFY] FAIL', e);
  process.exit(20);
});
