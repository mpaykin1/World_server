const { chromium } = require('C:/Users/user/Desktop/World_server/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Users/user/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto('http://127.0.0.1:5173/play/micropolis', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /Park/ }).click();
  const canvas = page.locator('canvas.tileview-canvas');
  const points = [{x:80,y:80},{x:1240,y:80},{x:80,y:780},{x:1240,y:780},{x:300,y:120},{x:1180,y:420},{x:700,y:100},{x:700,y:780}];
  const seen = [];
  let found = null;
  for (const point of points) {
    await canvas.click({ position: point });
    await page.locator('.forecast-backdrop').waitFor({ state: 'visible', timeout: 12000 });
    const loading = page.locator('.forecast-backdrop[role="status"]');
    if (await loading.count()) await loading.waitFor({ state: 'detached', timeout: 20000 });
    const modalText = await page.locator('.forecast-card').innerText();
    const yes = page.getByRole('button', { name: 'Да, строить' });
    const yesCount = await yes.count();
    const enabled = yesCount ? await yes.isEnabled({ timeout: 1000 }) : false;
    seen.push({ point, enabled, modalText: modalText.slice(0, 700) });
    if (enabled) { found = { point, modalText }; break; }
    const dismiss = page.getByRole('button', { name: /Нет|Закрыть/ });
    if (await dismiss.count()) await dismiss.click();
    await page.locator('.forecast-backdrop').waitFor({ state: 'detached', timeout: 4000 });
  }
  console.log(JSON.stringify({ found, seen, errors }, null, 2));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });