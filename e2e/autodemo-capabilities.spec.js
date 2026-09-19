const { test, expect } = require('@playwright/test');

const routeChoices = [
  ['direction', 'forest'], ['weather', 'storm'], ['creature', 'flying'],
  ['morph', 'wings'], ['behavior', 'attack'], ['enemy', 'stone'],
  ['combat', 'ranged'], ['build', 'fortress'], ['ai', 'tower'],
  ['treasure', 'diamonds'], ['crowd', 'settlement'], ['story', 'ancient'],
  ['past', 'giants'], ['next', 'openPortal'], ['action', 'tame'],
  ['neighbor', 'messenger'], ['newWorld', 'volcanic'],
  ['inhabitants', 'dragons'], ['newChange', 'ancientCity']
];

test('canonical AutoDemo materializes every major capability group', async ({ page }) => {
  test.setTimeout(60000);
  const critical = [];
  page.on('pageerror', error => critical.push(error.message));
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (url.pathname === '/api/world-factory') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"worlds":[]}' });
    return route.continue();
  });
  const response = await page.goto('/apps/voxel-world/?autodemo=1&demoStageMs=2500', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBe(200);
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 15000 });
  await page.waitForFunction(() => window.VoxelWorldRuntime?.stats?.()?.playable && window.WorldStackAutodemo?.stats?.()?.active, null, { timeout: 20000 });
  for (let i = 0; i < routeChoices.length; i++) {
    const [stage, choice] = routeChoices[i];
    await page.evaluate(({ i, choice }) => {
      window.WorldStackAutodemo.show(i + 1);
      window.WorldStackAutodemo.choose(choice);
    }, { i, choice });
    const stats = await page.evaluate(() => window.WorldStackAutodemo.stats());
    expect(stats.choices[stage], stage).toBe(choice);
  }

  await page.waitForTimeout(800);
  const stats = await page.evaluate(() => window.WorldStackAutodemo.stats());
  expect(stats.environment).toBe('storm');
  expect(stats.creature).toBeTruthy();
  expect(stats.enemy).toBeTruthy();
  expect(stats.agents).toBeGreaterThanOrEqual(5);
  expect(stats.canonCount).toBeGreaterThanOrEqual(5);
  expect(stats.persistentChanges).toBeGreaterThanOrEqual(4);
  expect(stats.choices.newWorld).toBe('volcanic');
  expect(stats.choices.inhabitants).toBe('dragons');
  expect(stats.choices.newChange).toBe('ancientCity');
  expect(critical).toEqual([]);
});
