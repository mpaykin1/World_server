'use strict';
// Non-mutating public preview QA: two independent browser storage sessions.
// Never places blocks or macro entities in the shared "main" world.
const { chromium, devices } = require('@playwright/test');
const { cloudflareIdentityGate, screenshotHasVisualSignal } = require('./verify-working-link.cjs');

async function openPlayer(browser, name, device, url) {
  const context = await browser.newContext({ ...device, locale: 'ru-RU' });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
  if (!response?.ok()) throw new Error(name + ': HTTP ' + response?.status());
  await page.waitForFunction(
    () => globalThis.VoxelWorldRuntime?.stats?.().playable === true,
    null, { timeout: 55000 }
  );
  const initial = await page.evaluate(() => globalThis.VoxelWorldRuntime.stats());
  await page.locator('#vwWorldBoardOpen').waitFor({ state: 'visible', timeout: 12000 });
  await page.locator('#vwWorldBoardOpen').click();
  await page.locator('.we-map').waitFor({ state: 'visible', timeout: 12000 });
  const boardInfo = await page.evaluate(() => ({
    entityChoices: document.querySelectorAll('.we-palette-item').length,
    mapVisible: !!document.querySelector('.we-map')?.getBoundingClientRect().width
  }));
  await page.locator('.we-close').click();
  return { name, context, page, pageErrors, initial, boardInfo };
}

async function measureFps(page) {
  await page.bringToFront();
  return await page.evaluate(() => new Promise(resolve => {
    let count = 0, first = null, last = null;
    const watchdog = setTimeout(() => resolve({ fps: 0, frames: count, timeout: true }), 12000);
    function frame(t) {
      first ??= t;
      last = t;
      if (++count >= 55) {
        clearTimeout(watchdog);
        resolve({ fps: Math.round(1000 * (count - 1) / Math.max(1, last - first)), frames: count });
      } else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }));
}

async function main() {
  const [origin, expectedSha] = process.argv.slice(2);
  if (!origin || !expectedSha) throw new Error('usage: live-two-player-qa <origin> <exact-sha>');
  const url = new URL('/apps/voxel-world/?world=main', origin).href;
  const identity = await cloudflareIdentityGate(url, expectedSha);
  const channel = process.env.PLAYWRIGHT_SYSTEM_CHANNEL;
  const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
  const players = [];
  try {
    players.push(await openPlayer(browser, 'desktop', devices['Desktop Chrome'], url));
    players.push(await openPlayer(browser, 'mobile-emulated', devices['Pixel 7'], url));
    // Validate the same realtime world is simultaneously visible to both guests.
    let presence = false;
    try {
      await Promise.all(players.map(({page}) => page.waitForFunction(() => {
        const text = document.getElementById('vwPlayers')?.textContent || '';
        return Number(text.match(/\d+/)?.[0] || 0) >= 2;
      }, null, { timeout: 16000 })));
      presence = true;
    } catch {}
    const results = [];
    for (const player of players) {
      const fps = await measureFps(player.page);
      const screenshot = await player.page.screenshot();
      const state = await player.page.evaluate(() => globalThis.VoxelWorldRuntime.stats());
      results.push({
        profile: player.name, backendMode: state.backendMode,
        playable: state.playable, chunks: state.chunks,
        board: player.boardInfo, fps, visualSignal: screenshotHasVisualSignal(screenshot),
        playersLabel: await player.page.locator('#vwPlayers').innerText(),
        pageErrors: player.pageErrors
      });
    }
    const ok = presence && results.every(r => r.backendMode === 'online' && r.playable
      && r.board.entityChoices >= 2 && r.board.mapVisible && r.visualSignal && !r.pageErrors.length);
    console.log(JSON.stringify({ ok, identity, presence, results }, null, 2));
    if (!ok) process.exitCode = 2;
  } finally {
    await Promise.all(players.map(p => p.context.close()));
    await browser.close();
  }
}

if (require.main === module) main().catch(e => {
  console.error('[TWO_PLAYER_QA] FAIL ' + e.stack); process.exitCode = 1;
});
