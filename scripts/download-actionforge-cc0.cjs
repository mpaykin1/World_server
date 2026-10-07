const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.resolve('assets/characters/actionforge-quaternius');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ acceptDownloads: true });
  await page.goto('https://actionforge.app/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => /\d+/.test(document.querySelector('#lib-count')?.textContent || ''), null, { timeout: 60000 });
  const libraryCount = (await page.locator('#lib-count').textContent()).trim();
  const rigPath = path.join(outDir, 'rig-human.glb');
  const noticePath = path.join(outDir, 'THIRD-PARTY-NOTICES.txt');
  const rigResponse = await page.request.get('https://actionforge.app/assets/animation-library/rig/rig-human.glb');
  const noticeResponse = await page.request.get('https://actionforge.app/THIRD-PARTY-NOTICES.txt');
  if (!rigResponse.ok() || !noticeResponse.ok()) throw new Error('Failed to fetch ActionForge rig/licence');
  fs.writeFileSync(rigPath, await rigResponse.body());
  fs.writeFileSync(noticePath, await noticeResponse.body());
  const fpsPath = path.join(outDir, 'fps_test.glb');
  if (await page.locator('[data-id="fps_test"]').count()) {
    const fpsResponse = page.waitForResponse((res) => res.url().includes('/animations/fps/fps_test.glb'), { timeout: 30000 });
    await page.locator('[data-id="fps_test"]').click();
    fs.writeFileSync(fpsPath, await (await fpsResponse).body());
  }
  await page.locator('#lib-bundle-format').selectOption('glb');
  if (await page.locator('#lib-bundle-rig').isChecked()) await page.locator('#lib-bundle-rig').uncheck();
  if (await page.locator('#lib-split').isChecked()) await page.locator('#lib-split').uncheck();
  await page.locator('#lib-bundle-all').click();
  await page.waitForFunction(() => !document.querySelector('#lib-bundle-go')?.disabled, null, { timeout: 30000 });
  const selected = (await page.locator('#lib-bundle-count').textContent()).trim();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 180000 }),
    page.locator('#lib-bundle-go').click()
  ]);
  const output = path.join(outDir, 'actionforge-quaternius-animations.glb');
  await download.saveAs(output);
  await browser.close();
  console.log(JSON.stringify({
    libraryCount, selected, suggested: download.suggestedFilename(),
    animationsBytes: fs.statSync(output).size,
    fpsBytes: fs.existsSync(fpsPath) ? fs.statSync(fpsPath).size : 0,
    rigBytes: fs.statSync(rigPath).size,
    noticeBytes: fs.statSync(noticePath).size
  }));
})().catch((error) => { console.error(error); process.exit(1); });
