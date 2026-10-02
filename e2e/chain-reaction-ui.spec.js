'use strict';
const { test, expect } = require('@playwright/test');

// Browser/UI contract fixtures only: these do not certify live persistence or auth.
const TOKEN = 'chain-reaction-browser-fixture';
const WORLD = 'chain-fixture';
const types = ['solar', 'temple', 'geothermal', 'workshop'];
function savedWorld(revision = 7) {
  return { schema: 1, revision, tick: revision - 4,
    resources: { power: 31, water: 42, food: 53, budget: 640 },
    projects: [{ id: 'saved-temple', type: 'temple', active: true, remaining: 0 }],
    residents: [{ name: 'Fixture Resident', building: 'Saved House', floor: 2, flat: 8 }],
    culture: {}, history: [] };
}

async function bootFixture(page, { count = 2, conflict = false } = {}) {
  const requests = [];
  let world = savedWorld(), ticks = 0;
  await page.addInitScript(token => localStorage.setItem('webgl_hub_token', token), TOKEN);
  await page.route('**/api/config', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: '{"error":"offline browser fixture"}' }));
  await page.route('**/api/voxel', async route => {
    const request = route.request();
    const body = request.postDataJSON() || {};
    requests.push(body);
    const reply = (value, status = 200) => route.fulfill({ status,
      contentType: 'application/json', body: JSON.stringify(value) });
    if (!['genie-options', 'preview-plan', 'game-state', 'tick'].includes(body.action)) {
      return reply({ error: 'Not a fixture action' }, 503);
    }
    if (request.method() !== 'POST' || body.worldId !== WORLD ||
      request.headers().authorization !== `Bearer ${TOKEN}`) return reply({ error: 'Fixture request contract mismatch' }, 400);
    const cards = types.slice(0, count).map((structure, i) => ({ structure,
      plan: { feasible: true, cost: 101 + i, buildTicks: 2 + i, risk: 0, missing: [] } }));
    if (body.action === 'tick') {
      ticks++;
      if (conflict && ticks === 1) {
        world = savedWorld(9); // Another player committed; the rejected tick did not.
        return reply({ error: 'STALE_REVISION' }, 409);
      }
      if (body.expectedRevision !== world.revision) return reply({ error: 'STALE_REVISION' }, 409);
      world = savedWorld(world.revision + 1);
    }
    const base = { worldId: WORLD, scenarioVersion: 1, revision: world.revision };
    if (body.action === 'genie-options') return reply({ ...base, cards });
    if (body.action === 'game-state') return reply({ ...base, world, cards });
    return reply({ ...base, world, plan: { feasible: true, cost: 101, buildTicks: 2, risk: 0, missing: [] } });
  });
  await page.goto(`/apps/voxel-world/?world=${WORLD}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.VoxelWorldRuntime?.stats?.().playable === true,
    null, { timeout: 20000 });
  await page.locator('.gj-mode').click();
  await expect(page.locator('#gjTime')).toContainText('ревизия 7');
  await expect(page.locator('#gjStatus')).toHaveClass('gj-ok');
  return requests;
}

for (const count of [0, 2, 4]) {
  test(`Chain Reaction renders exactly ${count} server cards and restores saved world (mock API)`, async ({ page }) => {
    await bootFixture(page, { count });
    await expect(page.locator('#gjCards .gj-card')).toHaveCount(count);
    await expect(page.locator('#gjCards .gj-card b')).toHaveText(types.slice(0, count));
    for (let i = 0; i < count; i++) {
      await expect(page.locator('#gjCards .gj-card').nth(i)).toContainText(`Стоимость ${101 + i} · строительство ${2 + i} такт.`);
    }
    await expect(page.locator('#gjCustom')).toBeVisible();
    await expect(page.locator('#gjProjects')).toContainText('temple: работает');
    await expect(page.locator('#gjResident')).toContainText('Fixture Resident · Saved House, этаж 2, кв. 8');
    await expect(page.locator('#gjRes span')).toHaveText(['⚡ 31', '💧 42', '🌾 53', '₾ 640']);
    if (count === 0) await expect(page.locator('#gjStatus')).toContainText('не нашёл допустимых карточек');
  });
}

test('Chain Reaction refreshes a rejected tick without replay, then accepts a manual tick (mock API)', async ({ page }) => {
  const requests = await bootFixture(page, { conflict: true });
  await page.locator('#gjTick').click();
  await expect(page.locator('#gjTime')).toContainText('ревизия 9');
  await expect(page.locator('#gjStatus')).toContainText('нажмите +1 такт ещё раз');
  expect(requests.filter(r => r.action === 'tick').map(r => r.expectedRevision)).toEqual([7]);
  await page.locator('#gjTick').click();
  await expect(page.locator('#gjTime')).toContainText('ревизия 10');
  await expect(page.locator('#gjStatus')).toContainText('Мир продвинут');
  expect(requests.filter(r => r.action === 'tick').map(r => [r.expectedRevision, r.count])).toEqual([[7, 1], [9, 1]]);
});

test('desktop strategy world clicks do not invoke FPS pointer lock or block requests', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const requests = await bootFixture(page);
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas[data-golden-three="1"]');
    const original = canvas.requestPointerLock;
    window.fixturePointerLockCalls = 0;
    canvas.requestPointerLock = function (...args) {
      window.fixturePointerLockCalls++;
      return original?.apply(this, args);
    };
  });
  const canvas = page.locator('canvas[data-golden-three="1"]');
  const box = await canvas.boundingBox();
  await canvas.click({ position: { x: box.width * .8, y: box.height * .65 } });
  expect(await page.evaluate(() => window.fixturePointerLockCalls)).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await canvas.click({ position: { x: box.width * .8, y: box.height * .65 } });
  expect(requests.filter(r => r.action === 'set_block')).toEqual([]);
  await expect(page.locator('#genieHud')).toBeVisible();
});
