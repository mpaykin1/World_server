const { test, expect } = require('@playwright/test');

const worlds = [
  'ai3d-voxel-city',
  'cinematic-encounter',
  'dark-void-scene',
  'survival',
  'voxel-world',
  'world-sharabass'
];

const criticalConsole = /WebGLProgram|shader error|VALIDATE_STATUS|GL_INVALID|Uncaught|TypeError|ReferenceError|SyntaxError/i;

test.describe('Golden world fleet render gate', () => {
  for (const world of worlds) {
    test(`${world} renders a Golden frame without critical runtime errors`, async ({ page }) => {
      const critical = [];
      page.on('pageerror', error => critical.push(`page:${error.message}`));
      page.on('console', message => {
        if (message.type() === 'error' && criticalConsole.test(message.text())) critical.push(`console:${message.text()}`);
      });

      const response = await page.goto(`/apps/${world}/?goldenPhase=sunset`, { waitUntil: 'domcontentloaded' });
      expect(response?.status(), world).toBe(200);
      await expect(page.locator('canvas').first(), world).toBeVisible({ timeout: 15000 });
      if (world === 'ai3d-voxel-city') await page.waitForFunction(() => window.AI3DVoxelRuntime?.stats?.()?.defaultCityLoaded && window.AI3DVoxelRuntime?.stats?.()?.player?.playable, null, { timeout: 25000 });
      if (world === 'voxel-world') await page.waitForFunction(() => window.VoxelWorldRuntime?.stats?.()?.playable === true, null, { timeout: 20000 });
      await page.waitForTimeout(600);
      const golden = await page.evaluate(() => {
        const diag = window.GoldenPaintingAtmosphere?.diagnostics?.();
        return {
          cycleAlive: diag?.cycleAlive === true,
          phase: diag?.phase || null,
          adapterCount: Array.isArray(diag?.adapters) ? diag.adapters.length : 0,
          voxelPlayable: window.VoxelWorldRuntime?.stats?.()?.playable ?? null,
          ai3dPlayable: window.AI3DVoxelRuntime?.stats?.()?.player?.playable ?? null
        };
      });

      expect(golden.cycleAlive, `${world}: Golden cycle`).toBeTruthy();
      expect(golden.phase, `${world}: Golden phase`).toBeTruthy();
      if (world === 'voxel-world') expect(golden.voxelPlayable, world).toBeTruthy();
      if (world === 'ai3d-voxel-city') expect(golden.ai3dPlayable, world).toBeTruthy();
      expect(critical, `${world}: critical browser/WebGL errors`).toEqual([]);
    });
  }
});
