const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.route('**/api/voxel', async route => {
    const data = route.request().postDataJSON();
    if (data.action !== 'macro_read') return route.fulfill({ status:400, body:'{}' });
    return route.fulfill({
      status:200, contentType:'application/json',
      body:JSON.stringify({
        worldId:data.worldId,
        emergence:{ revision:11, entities:[{type:'forest',x:0,z:0},{type:'city',x:12,z:0}] }
      })
    });
  });
});
test('desktop: world handshake, playable warrior, automatic enemy spawn and pause', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'desktop smoke only');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/apps/survivors-arena/?world=main');
  await expect(page.locator('#world-status')).toContainText('Общий мир подключён');
  await page.getByRole('button', { name:/Воин/ }).click();
  await expect.poll(() => page.evaluate(() => window.__SURVIVORS_ARENA_READY__?.snapshot().started)).toBe(true);
  const started = await page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot());
  expect(started.worldConnected).toBe(true);
  expect(started.sharedWorldReadOnly).toBe(true);
  expect(started.tags).toEqual(['forest','city']);
  expect(started.canvas.pixels).toBeGreaterThan(300000);
  const initial = started.player.x;
  await page.keyboard.down('d');
  await page.waitForTimeout(480);
  await page.keyboard.up('d');
  const moved = await page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot());
  expect(moved.player.x).toBeGreaterThan(initial + .6);
  await expect.poll(() => page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot().enemies), { timeout:4000 }).toBeGreaterThan(0);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot().paused)).toBe(true);
  await page.screenshot({ path:'test-results/survivors-arena-desktop.png' });
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot().paused)).toBe(false);
  expect(errors).toEqual([]);
});

test('iPhone WebKit: mobile layout, worker role and draggable joystick', async ({ page }) => {
  test.skip(test.info().project.name !== 'mobile-webkit', 'iPhone smoke only');
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/apps/survivors-arena/?world=main');
  await expect(page.locator('#world-status')).toContainText('Общий мир подключён');
  await page.getByRole('button', { name:/Рабочий/ }).click();
  await expect(page.locator('#pad')).toBeVisible();
  const before = await page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot());
  expect(before.role).toBe('worker');
  expect(before.canvas.width).toBeGreaterThan(320);
  const rect = await page.locator('#pad').boundingBox();
  expect(rect).toBeTruthy();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 34, rect.y + rect.height / 2, { steps:6 });
  await page.waitForTimeout(510);
  await page.mouse.up();
  const after = await page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot());
  expect(after.player.x).toBeGreaterThan(before.player.x + .2);
  await expect(page.locator('#xp-bar')).toBeAttached();
  await page.screenshot({ path:'test-results/survivors-arena-iphone.png' });
  expect(errors).toEqual([]);
});

test('local integration fixture: a real gem triggers 3-choice level up and resumes simulation', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'desktop integration only');
  await page.goto('/apps/survivors-arena/?e2e=1');
  await page.getByRole('button', { name:/Мэр/ }).click();
  const seeded = await page.evaluate(() => window.__SURVIVORS_ARENA_READY__.injectTestGem());
  expect(seeded).toBe(true);
  await expect(page.locator('#upgrade-modal')).toBeVisible();
  await expect(page.locator('#upgrades button')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot().level)).toBe(2);
  await page.locator('#upgrades button').first().click();
  await expect(page.locator('#upgrade-modal')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot().paused)).toBe(false);
});

test('server failure: solo arena remains playable and reports its offline status', async ({ page }) => {
  test.skip(test.info().project.name !== 'desktop-chromium', 'desktop resilience only');
  await page.route('**/api/voxel', route => route.fulfill({status:503,body:'{"error":"offline"}'}));
  await page.goto('/apps/survivors-arena/');
  await expect(page.locator('#world-status')).toContainText('Автономный прототип');
  await page.getByRole('button', {name:/Воин/}).click();
  const snapshot = await page.evaluate(() => window.__SURVIVORS_ARENA_READY__.snapshot());
  expect(snapshot.started).toBe(true);
  expect(snapshot.worldConnected).toBe(false);
});
