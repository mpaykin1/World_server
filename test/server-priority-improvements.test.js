'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const json = (p) => JSON.parse(read(p));

test('web/server release scope excludes physical mobile from mandatory readiness', () => {
  const scope = json('data/release-scope.json');
  assert.equal(scope.releaseProfile, 'web-server');
  assert.deepEqual(scope.targets, ['web', 'server']);
  assert.equal(scope.requirePhysicalMobile, false);
});

test('long soak requires real continuity and cannot stale-resume to certification', () => {
  const src = read('scripts/long-soak-runner.cjs');
  const policy = json('data/long-soak-policy.json');
  assert.equal(policy.minimumCertifiedHours, 8);
  assert.ok(Number(policy.resumeMaxGapSeconds) > 0);
  assert.match(src, /continuityOk/);
  assert.match(src, /resumeMaxGap/);
  assert.match(src, /longCertified=.*continuityOk/);
});
test('production hardening artifacts are reproducible and secret-free', () => {
  const required = [
    'supabase/migrations/20260908192035_world_server_remote_cas.sql',
    'supabase/migrations/20260908194300_fix_world_server_renew_lease_ambiguity.sql',
    'supabase/migrations/20260908194800_world_server_fenced_migration_probe.sql',
    'supabase/migrations/20260908200700_harden_browser_ai_reconcile_worker_health.sql',
    'supabase/migrations/20260908200800_index_image_world_jobs_world_id.sql',
    'supabase/migrations/20260908200900_consolidate_world_remote_tasks_select_policy.sql',
    'supabase/functions/world-server-cas-canary/index.ts',
    'supabase/functions/world-server-lease-canary/index.ts',
  ];
  for (const rel of required) assert.equal(fs.existsSync(path.join(ROOT, rel)), true, rel);
  const combined = required.map(read).join('\n');
  assert.doesNotMatch(combined, /WORLD_SERVER_CAS_TOKEN\s*=|WORLD_SERVER_LEASE_TOKEN\s*=/);
  assert.doesNotMatch(combined, /93939c61742f0267e44c3b96d7aaddb8|e47d4aaf55630a00506a5dc410a68fc8/);
});

test('worker reconcile is service-only while token-auth worker endpoints remain explicit', () => {
  const sql = read('supabase/migrations/20260908200700_harden_browser_ai_reconcile_worker_health.sql');
  assert.match(sql, /from public, anon, authenticated/);
  assert.match(sql, /to service_role/);
});