'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const verifier = fs.readFileSync(path.join(root, 'scripts', 'verify-durable-canon-live.cjs'), 'utf8');
const cleanup = fs.readFileSync(path.join(root, 'lib', 'durable-canon-cleanup.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261002230000_world_canon_social_lineage.sql'), 'utf8');

test('durable canon live verifier uses real write, retry, fresh reads, and reconnect browsers', () => {
  assert.match(verifier, /method: 'POST'/);
  assert.match(verifier, /const first = await post\(\);[\s\S]*const retry = await post\(\)/);
  assert.match(verifier, /fresh source read missed the durable event/);
  assert.match(verifier, /fresh connected-world read missed the consequence/);
  assert.match(verifier, /visibleAfterReconnect[\s\S]*devices\['Desktop Chrome'\]/);
  assert.match(verifier, /locator\('#loading'\)\.waitFor\(\{ state: 'hidden'/);
  assert.match(verifier, /target\.target_world_id, target\.summary, devices\['Pixel 7'\], true/);
  assert.match(verifier, /requireEffect[\s\S]*visibleEffects > 0/);
});

test('durable canon live verifier fails closed and cleans all bounded test state', () => {
  assert.match(verifier, /authorization: `Bearer \$\{registration\.token\}`/);
  assert.match(verifier, /worldId: '\.\.\/escape'/);
  assert.match(verifier, /hostile\.status === 400/);
  assert.match(verifier, /testNamespace: 'fleet-durable-canon'/);
  assert.doesNotMatch(verifier, /from\('world_canon_events'\)\.delete\(\)/);
  assert.match(verifier, /cleanupDurableCanonState\(admin, \{ sourceEventKey, userId, username \}\)/);
  assert.match(verifier, /cleanupErrors\.length && !primaryError/);
  assert.match(verifier, /cleanup after primary failure/);
  assert.match(cleanup, /from\('profiles'\)[\s\S]*username\.toLowerCase\(\)/);
  assert.match(cleanup, /admin\.auth\.admin\.deleteUser\(resolvedUserId\)/);
  assert.match(verifier, /DURABLE_CANON_EXTERNAL_CLEANUP === '1'/);
  assert.match(verifier, /\^\[0-9a-f\]\{10\}\$/);
  assert.match(verifier, /externalCleanup \? null : createAdminClient\(\)/);
  assert.match(verifier, /DURABLE_CANON_TOKEN/);
  assert.match(verifier, /pre-provisioned auth requires external cleanup mode/);
  assert.match(verifier, /DURABLE_CANON_USER_ID is required/);
  assert.match(verifier, /DURABLE_CANON_BROWSER_PATH/);
  assert.match(verifier, /executablePath \? \{ executablePath \} : \{\}/);
});

test('append-only migration exposes only a bounded service-role Fleet purge', () => {
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i);
  assert.match(migration, /payload ->> 'testNamespace' = 'fleet-durable-canon'/);
  assert.match(migration, /revoke all on function public\.purge_fleet_durable_canon\(text\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.purge_fleet_durable_canon\(text\) to service_role/);
});
