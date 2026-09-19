'use strict';

const crypto = require('node:crypto');
const { chromium, devices } = require('@playwright/test');
const { createAdminClient } = require('../lib/env');

async function json(origin, pathname, options = {}) {
  const response = await fetch(new URL(pathname, origin), {
    redirect: 'follow', signal: AbortSignal.timeout(30000), ...options
  });
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch {}
  if (!response.ok) throw new Error(`${pathname} failed: HTTP ${response.status} ${body?.error || text.slice(0, 160)}`);
  return body;
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function visibleAfterReconnect(browser, origin, token, worldId, expectedText, device) {
  const context = await browser.newContext(device);
  await context.addInitScript(value => localStorage.setItem('webgl_hub_token', value), token);
  const page = await context.newPage();
  const response = await page.goto(new URL(`/apps/voxel-world/?world=${encodeURIComponent(worldId)}`, origin).href, { waitUntil: 'domcontentloaded' });
  assert(response?.ok(), `world ${worldId} returned HTTP ${response?.status()}`);
  await page.locator('#loading.hidden').waitFor({ timeout: 30000 });
  await page.locator('#vwCanon').filter({ hasText: expectedText }).waitFor({ timeout: 20000 });
  const runtime = await page.evaluate(() => window.VoxelWorldRuntime?.stats?.());
  assert(runtime?.playable, `world ${worldId} did not become playable`);
  assert(runtime?.canon?.seen > 0, `world ${worldId} did not hydrate canon`);
  await context.close();
  return { worldId, status: runtime.canon.status, visibleEffects: runtime.canon.visibleEffects };
}

async function run(origin, expectedSha) {
  const admin = createAdminClient();
  const suffix = crypto.randomBytes(5).toString('hex');
  const username = `fleetcanon_${suffix}`;
  const password = `Ws!${crypto.randomBytes(12).toString('base64url')}`;
  const marker = `Fleet durable canon ${suffix}`;
  let userId = '';
  let eventKeys = [];
  try {
    const config = await json(origin, '/api/config');
    if (expectedSha) assert(config.deployedRevision === expectedSha, `revision mismatch: ${config.deployedRevision}`);
    const registration = await json(origin, '/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    assert(registration.token && registration.user?.id, 'registration did not return a session');
    userId = registration.user.id;
    const payload = { action: 'record', worldId: 'main', eventType: 'player_world_change',
      summary: marker, payload: { testNamespace: 'fleet-durable-canon', marker },
      idempotencyKey: `fleet-durable-canon-${suffix}` };
    const post = () => json(origin, '/api/canon', {
      method: 'POST',
      headers: { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const first = await post();
    const retry = await post();
    assert(first.event?.event_key === retry.event?.event_key, 'retry changed the source event key');
    assert(first.consequences?.length > 0, 'no connected-world consequence was produced');
    eventKeys = [first.event, ...first.consequences].map(event => event.event_key);
    assert(new Set(eventKeys).size === eventKeys.length, 'mutation returned duplicate event keys');

    const source = await json(origin, '/api/canon?worldId=main&limit=50');
    assert(source.events.some(event => event.event_key === first.event.event_key), 'fresh source read missed the durable event');
    const target = first.consequences[0];
    const connected = await json(origin, `/api/canon?worldId=${encodeURIComponent(target.target_world_id)}&limit=50`);
    assert(connected.events.some(event => event.event_key === target.event_key), 'fresh connected-world read missed the consequence');
    assert(target.payload?.effect?.kind === 'canon_beacon', 'connected consequence has no visible canon beacon');

    const browser = await chromium.launch({ headless: true });
    let desktop;
    let mobile;
    try {
      desktop = await visibleAfterReconnect(browser, origin, registration.token, 'main', marker, devices['Desktop Chrome']);
      mobile = await visibleAfterReconnect(browser, origin, registration.token, target.target_world_id, 'Последствие', devices['Pixel 7']);
    } finally {
      await browser.close();
    }
    return { ok: true, origin, expectedSha: expectedSha || null, sourceEventKey: first.event.event_key,
      consequenceEventKey: target.event_key, targetWorldId: target.target_world_id, idempotentRetry: true,
      freshSourceRead: true, freshConnectedRead: true, desktop, mobile, cleanupKeys: eventKeys };
  } finally {
    if (eventKeys.length) {
      const { error } = await admin.from('world_canon_events').delete().in('event_key', eventKeys);
      if (error) throw new Error(`canon cleanup failed: ${error.message}`);
    }
    if (userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw new Error(`test user cleanup failed: ${error.message}`);
    }
  }
}

async function main() {
  const origin = process.argv[2];
  const expectedSha = process.argv[3] || '';
  if (!origin) throw new Error('usage: node scripts/verify-durable-canon-live.cjs <origin> [expected-sha]');
  console.log(JSON.stringify(await run(origin, expectedSha), null, 2));
}

if (require.main === module) main().catch(error => {
  console.error(`[DURABLE_CANON_LIVE] FAIL ${error.message}`);
  process.exit(1);
});
module.exports = { json, visibleAfterReconnect, run };
