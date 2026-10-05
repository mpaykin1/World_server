'use strict';

const { chromium, devices } = require('@playwright/test');

function assertState(state, profile) {
  if (!state) throw new Error(`${profile}: missing ProkopiyMinecraftMVP state`);
  if (state.ready !== true) throw new Error(`${profile}: app ready flag is not true`);
  if (state.worldReady !== true) throw new Error(`${profile}: worldReady is not true`);
  if (state.animationReady !== true) throw new Error(`${profile}: animationReady is not true`);
  if (!Number.isFinite(state.chunkCount) || state.chunkCount < 1) throw new Error(`${profile}: no materialized chunks`);
  if (state.seedError) throw new Error(`${profile}: seed error: ${state.seedError}`);
  if (/seed error/i.test(String(state.regionText || ''))) throw new Error(`${profile}: HUD reports seed error`);
}

async function inspect(page) {
  return page.evaluate(() => {
    const mvp = globalThis.ProkopiyMinecraftMVP || null;
    return {
      ready: mvp?.ready,
      worldReady: mvp?.worldReady,
      animationReady: mvp?.animationReady,
      chunkCount: typeof mvp?.getChunkCount === 'function' ? mvp.getChunkCount() : mvp?.chunkCount,
      seedError: typeof mvp?.getSeedError === 'function' ? mvp.getSeedError() : mvp?.seedError,
      regionText: document.querySelector('#regionInfo')?.textContent || '',
      player: typeof mvp?.getPlayer === 'function' ? mvp.getPlayer() : null,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };
  });
}

async function exerciseTouchMove(page) {
  const canvas = page.locator('#world');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('mobile: world canvas missing');
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.58;
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#world');
    canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41, pointerType: 'touch', clientX: x, clientY: y }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 41, pointerType: 'touch', clientX: x + 34, clientY: y - 42 }));
  }, { x, y });
  await page.waitForTimeout(650);
  await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#world');
    canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, pointerType: 'touch', clientX: x + 34, clientY: y - 42 }));
  }, { x, y });
}

async function verify(url) {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    for (const [profile, device] of [['desktop', devices['Desktop Chrome']], ['mobile', devices['Pixel 7']]]) {
      const context = await browser.newContext({ ...device });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message || String(error)));
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      if (!response?.ok()) throw new Error(`${profile}: HTTP ${response?.status()}`);
      await page.waitForTimeout(3500);

      const before = await inspect(page);
      assertState(before, profile);

      if (profile === 'mobile') {
        await exerciseTouchMove(page);
        const after = await inspect(page);
        assertState(after, profile);
        if (!before.player || !after.player) throw new Error('mobile: player coordinates unavailable');
        const moved = Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z);
        if (!(moved > 0.05)) throw new Error(`mobile: touch did not move player (${moved})`);
        if (after.scrollX !== 0 || after.scrollY !== 0) throw new Error(`mobile: document scrolled to ${after.scrollX},${after.scrollY}`);
      }

      if (errors.length) throw new Error(`${profile}: page errors: ${errors.join(' | ')}`);
      evidence.push({ profile, state: await inspect(page) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  return evidence;
}

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Pass the deployed Prokopiy Minecraft successor URL');
  const evidence = await verify(url);
  console.log(JSON.stringify({ ok: true, url, verifiedAt: new Date().toISOString(), evidence }, null, 2));
}

if (require.main === module) main().catch(error => {
  console.error('[PROKOPIY_SUCCESSOR_GATE] FAIL ' + error.message);
  process.exit(1);
});

module.exports = { assertState, verify };
