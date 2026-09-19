'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const verifier = fs.readFileSync(path.join(root, 'scripts', 'verify-durable-canon-live.cjs'), 'utf8');

test('durable canon live verifier uses real write, retry, fresh reads, and reconnect browsers', () => {
  assert.match(verifier, /method: 'POST'/);
  assert.match(verifier, /const first = await post\(\);[\s\S]*const retry = await post\(\)/);
  assert.match(verifier, /fresh source read missed the durable event/);
  assert.match(verifier, /fresh connected-world read missed the consequence/);
  assert.match(verifier, /visibleAfterReconnect[\s\S]*devices\['Desktop Chrome'\]/);
  assert.match(verifier, /target\.target_world_id, target\.summary, devices\['Pixel 7'\], true/);
  assert.match(verifier, /requireEffect[\s\S]*visibleEffects > 0/);
});

test('durable canon live verifier fails closed and cleans all bounded test state', () => {
  assert.match(verifier, /authorization: `Bearer \$\{registration\.token\}`/);
  assert.match(verifier, /worldId: '\.\.\/escape'/);
  assert.match(verifier, /hostile\.status === 400/);
  assert.match(verifier, /testNamespace: 'fleet-durable-canon'/);
  assert.match(verifier, /\.delete\(\)\.eq\('cause_event_key', sourceEventKey\)/);
  assert.match(verifier, /\.delete\(\)\.eq\('event_key', sourceEventKey\)/);
  assert.match(verifier, /profiles'[\s\S]*username\.toLowerCase\(\)/);
  assert.match(verifier, /admin\.auth\.admin\.deleteUser\(userId\)/);
  assert.match(verifier, /DURABLE_CANON_EXTERNAL_CLEANUP === '1'/);
  assert.match(verifier, /\^\[0-9a-f\]\{10\}\$/);
  assert.match(verifier, /externalCleanup \? null : createAdminClient\(\)/);
});
