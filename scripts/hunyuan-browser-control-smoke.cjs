const { chromium } = require('@playwright/test');

(async () => {
  const url = process.argv[2] || 'http://127.0.0.1:8060/apps/hunyuan-world/';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.__hunyuanDebug?.ready === true, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__hunyuanDebug?.grounded === true, null, { timeout: 30000 });

  // Ensure canvas has focus for keyboard input (Godot Web requires click)
  try {
    await page.waitForSelector('canvas', { timeout: 10000 });
    await page.click('canvas');
    await page.waitForTimeout(300);
  } catch {}

  const start = await page.evaluate(() => ({ ...window.__hunyuanDebug }));
  if (Math.abs(start.roll) > 1e-5) throw new Error(`spawn roll != 0: ${start.roll}`);

  // Robust Space: Godot Web needs focused canvas and sometimes first Space is eaten
  let jumped = false;
  for (let attempt = 0; attempt < 4 && !jumped; attempt++) {
    try {
      // ensure focus
      await page.mouse.click(640, 360);
      await page.waitForTimeout(150);
    } catch {}
    // try press via Playwright, also dispatch DOM KeyboardEvent as fallback
    await page.keyboard.press('Space').catch(()=>{});
    await page.evaluate(() => {
      const ev = new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true });
      window.dispatchEvent(ev);
    }).catch(()=>{});
    await page.waitForTimeout(200);
    try {
      await page.waitForFunction(y0 => window.__hunyuanDebug?.y > y0 + 0.03, start.y, { timeout: 1500 });
      jumped = true;
    } catch {
      // log current y for debugging
      const cur = await page.evaluate(() => window.__hunyuanDebug?.y);
      console.log(`[HUNYUAN_BROWSER_GATE] attempt ${attempt} y=${cur} start=${start.y}`);
    }
  }
  if (!jumped) {
    const cur = await page.evaluate(() => ({ ...window.__hunyuanDebug }));
    throw new Error(`Space did not move player upward after 4 attempts: start y=${start.y} cur y=${cur.y} grounded=${cur.grounded}`);
  }
  const airborne = await page.evaluate(() => ({ ...window.__hunyuanDebug }));
  const jumpXZ = Math.hypot(airborne.x - start.x, airborne.z - start.z);
  if (jumpXZ > 0.035) throw new Error(`Space introduced horizontal motion: ${jumpXZ}`);
  if (!(airborne.vy > 0)) throw new Error(`Space did not create upward velocity: vy=${airborne.vy}`);

  await page.waitForFunction(y0 => window.__hunyuanDebug?.grounded === true && Math.abs(window.__hunyuanDebug.y - y0) < 0.12, start.y, { timeout: 5000 });
  const landed = await page.evaluate(() => ({ ...window.__hunyuanDebug }));
  const landedXZ = Math.hypot(landed.x - start.x, landed.z - start.z);
  if (landedXZ > 0.05) throw new Error(`vertical jump did not land at same XZ: ${landedXZ}`);

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(450);
  await page.keyboard.up('ArrowUp');
  const moved = await page.evaluate(() => ({ ...window.__hunyuanDebug }));
  const walkXZ = Math.hypot(moved.x - landed.x, moved.z - landed.z);
  if (walkXZ < 0.20) throw new Error(`ArrowUp did not move player: ${walkXZ}`);
  if (Math.abs(moved.roll) > 1e-5) throw new Error(`walking introduced roll: ${moved.roll}`);

  if (errors.length) throw new Error(`browser errors: ${errors.join(' | ')}`);
  console.log('[HUNYUAN_BROWSER_GATE] PASS', { start, airborne, landed, moved });
  await browser.close();
})().catch(async err => {
  console.error('[HUNYUAN_BROWSER_GATE] FAIL', err);
  process.exit(1);
});
