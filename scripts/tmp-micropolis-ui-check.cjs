const { chromium } = require('C:/Users/user/Desktop/World_server/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/user/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:5173/play/micropolis', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  const buttons = await page.locator('button').allTextContents();
  const text = (await page.locator('body').innerText()).slice(0, 5000);
  console.log(JSON.stringify({ url: page.url(), title: await page.title(), buttons, text, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });