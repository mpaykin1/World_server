const { chromium } = require('playwright');
const fs = require('node:fs');

const base = process.argv[2] || process.env.TRINITY_URL || 'http://127.0.0.1:3107/apps/trinity-lab/';
const output = process.argv[3] || 'test-results/trinity-evidence.json';

async function probe(browser, name, contextOptions) {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error.stack || error.message)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  const response = await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trinityLab?.getDebug);
  await page.waitForTimeout(1600);
  const krieger = await page.evaluate(() => window.__trinityLab.getDebug());
  await page.evaluate(() => { window.__trinityLab.setMode('INK'); window.__trinityLab.moveCamera(.25,.15); });
  await page.waitForTimeout(900);
  const ink = await page.evaluate(() => window.__trinityLab.getDebug());
  const cube0 = await page.evaluate(() => { window.__trinityLab.setMode('CUBE'); return window.__trinityLab.restartCube(); });
  const cube46 = await page.evaluate(() => window.__trinityLab.setCubeProgress(.46));
  const cube1 = await page.evaluate(() => window.__trinityLab.setCubeProgress(1));
  await page.waitForTimeout(120);
  const cubeFinal = await page.evaluate(() => window.__trinityLab.getDebug());
  await context.close();
  return { name, httpStatus: response.status(), errors, krieger, ink, cube0, cube46, cube1, cubeFinal };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const desktop = await probe(browser, 'desktop', { viewport: { width: 1280, height: 800 } });
  const mobile = await probe(browser, 'mobile-portrait', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await browser.close();
  const evidence = { url: base, measuredAt: new Date().toISOString(), desktop, mobile };
  fs.mkdirSync(require('node:path').dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  if ([desktop, mobile].some(x => x.httpStatus !== 200 || x.errors.length || x.krieger.visibility < 85)) process.exit(1);
})().catch(error => { console.error(error); process.exit(1); });
