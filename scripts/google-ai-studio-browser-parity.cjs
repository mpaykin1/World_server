'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.env.WORLD_REPO_ROOT ? path.resolve(process.env.WORLD_REPO_ROOT) : path.resolve(__dirname, '..');
const REPORT_DIR = path.join(ROOT, '.world', 'google-ai-studio', 'reports', 'browser');
const REPLAY_FILE = path.join(ROOT, 'google-ai-studio', 'replay-smoke.json');
const requireBrowser = process.argv.includes('--require');

function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); }
function loadReplay() { try { return JSON.parse(fs.readFileSync(REPLAY_FILE, 'utf8')); } catch { return { actions: [] }; } }
function sha(data) { return crypto.createHash('sha256').update(data).digest('hex'); }
function semantic(text) { return sha(String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200000)); }
async function applyReplay(page, actions) {
  for (const action of actions || []) {
    if (action.type === 'wait') await page.waitForTimeout(Math.max(0, Math.min(5000, Number(action.ms || 0))));
    else if (action.type === 'assert-body-visible') {
      if (!(await page.locator('body').isVisible())) throw new Error('body is not visible');
    } else if (action.type === 'click') {
      await page.locator(action.selector).click({ timeout: action.timeoutMs || 5000 });
    } else if (action.type === 'fill') {
      await page.locator(action.selector).fill(String(action.value || ''), { timeout: action.timeoutMs || 5000 });
    } else if (action.type === 'press') {
      await page.locator(action.selector || 'body').press(action.key, { timeout: action.timeoutMs || 5000 });
    }
  }
}
async function main() {
  let pw;
  try { pw = require('playwright'); }
  catch (error) {
    const out = { ok: !requireBrowser, skipped: true, reason: 'playwright package not installed', install: 'Reuse existing Playwright if present; otherwise npm install -D playwright && npx playwright install chromium' };
    console.log(JSON.stringify(out, null, 2));
    if (requireBrowser) process.exitCode = 2;
    return;
  }
  const urls = {
    reference: process.env.GOOGLE_NAVIGATOR_REFERENCE_URL || '',
    navigator: process.env.GOOGLE_NAVIGATOR_URL || '',
    sandbox: process.env.GOOGLE_SANDBOX_URL || ''
  };
  const configured = Object.entries(urls).filter(([,u]) => u);
  if (!configured.length) {
    const out = { ok: !requireBrowser, skipped: true, reason: 'no URLs configured' };
    console.log(JSON.stringify(out, null, 2));
    if (requireBrowser) process.exitCode = 2;
    return;
  }
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const replay = loadReplay();
  const profiles = [
    { name: 'desktop', context: { viewport: { width: 1440, height: 900 } } },
    { name: 'iphone', context: pw.devices['iPhone 13'] || { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'android', context: pw.devices['Pixel 7'] || { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
    { name: 'landscape-mobile', context: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } }
  ];
  const browser = await pw.chromium.launch({ headless: true });
  const results = [];
  try {
    for (const profile of profiles) {
      for (const [role, url] of configured) {
        const context = await browser.newContext(profile.context);
        const page = await context.newPage();
        const consoleErrors = [];
        const pageErrors = [];
        page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 500)); });
        page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 500)));
        const started = Date.now();
        let response;
        let error = null;
        try {
          response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await applyReplay(page, replay.actions);
        } catch (e) { error = e.message; }
        const elapsedMs = Date.now() - started;
        const bodyText = error ? '' : await page.locator('body').innerText().catch(() => '');
        const overflow = error ? null : await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth)).catch(() => null);
        const screenshotPath = path.join(REPORT_DIR, `${role}-${profile.name}.png`);
        if (!error) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        const headers = response ? await response.allHeaders().catch(() => ({})) : {};
        results.push({
          role,
          profile: profile.name,
          url,
          ok: !error && Boolean(response) && response.status() < 500 && consoleErrors.length === 0 && pageErrors.length === 0 && (overflow == null || overflow <= 2),
          status: response?.status() || 0,
          elapsedMs,
          semanticBody: semantic(bodyText),
          correlationId: headers['x-world-correlation-id'] || null,
          horizontalOverflowPx: overflow,
          consoleErrors,
          pageErrors,
          error,
          screenshot: fs.existsSync(screenshotPath) ? path.relative(ROOT, screenshotPath).replace(/\\/g, '/') : null
        });
        await context.close();
      }
    }
  } finally { await browser.close(); }
  const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), ok: results.every(r => r.ok), results };
  writeJson(path.join(REPORT_DIR, 'latest.json'), report);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
main().catch(e => { console.error(e.stack || e.message); process.exit(1); });
