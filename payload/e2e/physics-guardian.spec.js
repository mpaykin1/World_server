const { test, expect } = require('@playwright/test');

test.describe('Physics Guardian v1', () => {
  test('spawn, grounding, wall safety and vertical jump invariants', async ({ page }) => {
    await page.goto('/apps/ai3d-voxel-city/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const s = window.AI3DVoxelRuntime?.stats();
      return s?.defaultCityLoaded === true && s?.player?.playable !== false;
    }, { timeout: 30000 });

    const state = () => page.evaluate(() => {
      const rt = window.AI3DVoxelRuntime;
      const p = rt.stats().player;
      return {
        x: p.x, y: p.y, z: p.z,
        onGround: p.onGround,
        inside: typeof rt.collidesAt === 'function' ? rt.collidesAt(p.x, p.y, p.z) : false
      };
    });

    const spawn = await state();
    expect(spawn.onGround).toBe(true);
    expect(spawn.inside).toBe(false);

    for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(400);
      await page.keyboard.up(key);
      const s = await state();
      expect(s.inside).toBe(false);
      expect(Number.isFinite(s.y)).toBe(true);
    }

    const pre = await state();
    await page.keyboard.press('Space');
    await page.waitForTimeout(180);
    const airborne = await state();
    expect(airborne.y).toBeGreaterThan(pre.y);

    await page.waitForFunction(() => window.AI3DVoxelRuntime.stats().player.onGround === true, { timeout: 3000 });
    const post = await state();
    expect(post.inside).toBe(false);
    expect(post.onGround).toBe(true);
  });
});
