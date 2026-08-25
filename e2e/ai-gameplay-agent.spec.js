const { test, expect } = require('@playwright/test');

test.describe('Dream AI gameplay agent v1', () => {
  test('agent can enter, move, explore, jump and remain physically valid', async ({ page }) => {
    await page.goto('/apps/ai3d-voxel-city/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      const rt = window.AI3DVoxelRuntime;
      if (!rt) return false;
      const s = rt.stats();
      return s.defaultCityLoaded === true && s.player && s.chunks > 0;
    }, { timeout: 30000 });

    const sample = () => page.evaluate(() => {
      const rt = window.AI3DVoxelRuntime;
      const p = rt.stats().player;
      return {
        x: p.x, y: p.y, z: p.z,
        onGround: p.onGround,
        inside: typeof rt.collidesAt === 'function' ? rt.collidesAt(p.x, p.y, p.z) : false
      };
    });

    const start = await sample();
    let travelled = 0;
    let previous = start;
    for (const key of ['KeyW', 'KeyD', 'KeyS', 'KeyA', 'ArrowUp', 'ArrowRight']) {
      await page.keyboard.down(key);
      await page.waitForTimeout(250);
      await page.keyboard.up(key);
      await page.waitForTimeout(80);
      const now = await sample();
      travelled += Math.hypot(now.x - previous.x, now.z - previous.z);
      previous = now;
      expect(Number.isFinite(now.x) && Number.isFinite(now.y) && Number.isFinite(now.z)).toBe(true);
      expect(now.inside).toBe(false);
    }
    expect(travelled).toBeGreaterThan(0.1);

    const beforeJump = await sample();
    await page.keyboard.press('Space');
    let maxY = beforeJump.y;
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(100);
      const s = await sample();
      maxY = Math.max(maxY, s.y);
      expect(s.inside).toBe(false);
    }
    expect(maxY).toBeGreaterThan(beforeJump.y + 0.03);

    await page.waitForFunction(() => window.AI3DVoxelRuntime.stats().player.onGround === true, { timeout: 3000 });
    const landed = await sample();
    expect(landed.onGround).toBe(true);
    expect(landed.inside).toBe(false);
  });
});
