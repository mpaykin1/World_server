'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const bridge = require('../scripts/collective-brain-remote-bridge.cjs');
const collectiveBrain = require('../lib/collective-brain');

const ROOT = path.resolve(__dirname, '..');

// Minimal in-memory fake of the subset of the supabase-js query builder this
// bridge actually uses (.from().select().eq().order().limit(),
// .from().update().eq()...select().single(), .from().select().in().lt()).
// Exercises REAL claim/reclaim/writeback logic against realistic CAS
// semantics, not a scripted call-sequence mock - a filter applied after an
// earlier write in the same test genuinely sees the updated row, exactly
// like a real Postgres round-trip would.
function fakeSupabase(initialRows) {
  const rows = initialRows.map((r) => ({ ...r }));
  function builder() {
    const filters = [];
    let updateData = null;
    let single = false;
    let orderSpec = null;
    let limitN = null;
    const api = {
      select() { return api; },
      eq(field, val) { filters.push((r) => r[field] === val); return api; },
      in(field, vals) { filters.push((r) => vals.includes(r[field])); return api; },
      lt(field, val) { filters.push((r) => r[field] != null && r[field] < val); return api; },
      order(field, { ascending = true } = {}) { orderSpec = { field, ascending }; return api; },
      limit(n) { limitN = n; return api; },
      update(data) { updateData = data; return api; },
      single() { single = true; return api; },
      then(resolve) {
        try {
          let matched = rows.filter((r) => filters.every((f) => f(r)));
          if (updateData) {
            matched.forEach((r) => Object.assign(r, updateData));
            resolve({ data: single ? (matched[0] || null) : matched, error: null });
            return;
          }
          if (orderSpec) matched = [...matched].sort((a, b) => (a[orderSpec.field] > b[orderSpec.field] ? 1 : -1) * (orderSpec.ascending ? 1 : -1));
          if (limitN != null) matched = matched.slice(0, limitN);
          resolve({ data: matched, error: null });
        } catch (e) { resolve({ data: null, error: { message: e.message } }); }
      },
    };
    return api;
  }
  return { from: () => builder(), rows };
}

function releaseAnyStrayLease() {
  try { collectiveBrain.releaseLease(ROOT, 'remote-bridge-worker'); } catch { /* ignore */ }
}

test('claimNextTask: two claim attempts on one queued row - second loses the race (real CAS semantics)', async () => {
  const sb = fakeSupabase([{ id: 't1', status: 'queued', command: 'known_issues_lookup', args: {}, created_at: '2026-01-01T00:00:00Z', retry_count: 0, max_retries: 2 }]);
  const first = await bridge.claimNextTask(sb, 'worker-a');
  assert.ok(first, 'first claimer should get the task');
  assert.equal(first.status, 'claimed');
  const second = await bridge.claimNextTask(sb, 'worker-b');
  assert.equal(second, null, 'second claimer must lose the race, never double-claim');
});

test('claimNextTask: empty queue returns null, not an error', async () => {
  const sb = fakeSupabase([]);
  const r = await bridge.claimNextTask(sb, 'worker-a');
  assert.equal(r, null);
});

test('claimNextTask: orders by created_at ascending (oldest task first)', async () => {
  const sb = fakeSupabase([
    { id: 'newer', status: 'queued', command: 'known_issues_lookup', created_at: '2026-02-01T00:00:00Z', retry_count: 0, max_retries: 2 },
    { id: 'older', status: 'queued', command: 'known_issues_lookup', created_at: '2026-01-01T00:00:00Z', retry_count: 0, max_retries: 2 },
  ]);
  const r = await bridge.claimNextTask(sb, 'worker-a');
  assert.equal(r.id, 'older');
});

test('reclaimStuckTasks: a task claimed past the stuck threshold with retry budget left is requeued, not lost', async () => {
  const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago
  const sb = fakeSupabase([{ id: 's1', status: 'claimed', command: 'run_tests', claimed_at: longAgo, retry_count: 0, max_retries: 2 }]);
  const r = await bridge.reclaimStuckTasks(sb, 'watchdog-check');
  assert.equal(r.reclaimed, 1);
  assert.equal(r.deadLettered, 0);
  const row = sb.rows.find((x) => x.id === 's1');
  assert.equal(row.status, 'queued', 'stuck task must go back to queued, not stay stuck forever');
  assert.equal(row.retry_count, 1);
  assert.equal(row.claimed_by, null, 'claim fields must be cleared so any worker can pick it up again');
});

test('reclaimStuckTasks: retry budget exhausted goes to dead_letter, never silently disappears', async () => {
  const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const sb = fakeSupabase([{ id: 's2', status: 'running', command: 'run_tests', claimed_at: longAgo, retry_count: 2, max_retries: 2 }]);
  const r = await bridge.reclaimStuckTasks(sb, 'watchdog-check');
  assert.equal(r.deadLettered, 1);
  const row = sb.rows.find((x) => x.id === 's2');
  assert.equal(row.status, 'dead_letter');
  assert.ok(row.error && row.error.length > 0, 'dead-lettered task must retain a human-readable reason');
});

test('reclaimStuckTasks: a task claimed recently is left alone (not falsely reclaimed)', async () => {
  const justNow = new Date().toISOString();
  const sb = fakeSupabase([{ id: 's3', status: 'running', command: 'run_tests', claimed_at: justNow, retry_count: 0, max_retries: 2 }]);
  const r = await bridge.reclaimStuckTasks(sb, 'watchdog-check');
  assert.equal(r.reclaimed, 0);
  assert.equal(r.deadLettered, 0);
  assert.equal(sb.rows[0].status, 'running');
});

test('runOnce: single-instance protection - a worker holding the lease blocks a concurrent cycle', async () => {
  releaseAnyStrayLease();
  const held = collectiveBrain.acquireLease(ROOT, 'remote-bridge-worker', { owner: 'other-worker-instance' });
  assert.ok(held.ok, 'test setup: should be able to take the lease first');
  try {
    const sb = fakeSupabase([{ id: 'x', status: 'queued', command: 'known_issues_lookup', args: { query: 'anything' }, created_at: '2026-01-01T00:00:00Z', retry_count: 0, max_retries: 2 }]);
    const r = await bridge.runOnce('would-be-second-worker', sb);
    assert.equal(r.drained, false);
    assert.match(r.reason, /lease held/);
    assert.equal(sb.rows[0].status, 'queued', 'a blocked worker must never touch the task at all');
  } finally {
    collectiveBrain.releaseLease(ROOT, 'remote-bridge-worker', 'other-worker-instance');
  }
});

test('runOnce: end-to-end happy path for a read-only command (known_issues_lookup) - queued -> running -> done', async () => {
  releaseAnyStrayLease();
  const sb = fakeSupabase([{ id: 'e2e-1', status: 'queued', command: 'known_issues_lookup', args: { query: 'inverted camera controls' }, created_at: '2026-01-01T00:00:00Z', requested_by: 'test', retry_count: 0, max_retries: 2 }]);
  const r = await bridge.runOnce('test-worker', sb);
  assert.equal(r.drained, true);
  assert.equal(r.status, 'done');
  const row = sb.rows.find((x) => x.id === 'e2e-1');
  assert.equal(row.status, 'done');
  assert.ok(row.result && row.result.ok === true);
  assert.ok(Array.isArray(row.result.matches));
});

test('runOnce: unknown command fails immediately without consuming a retry (non-retriable)', async () => {
  releaseAnyStrayLease();
  const sb = fakeSupabase([{ id: 'bad-1', status: 'queued', command: 'delete_everything', args: {}, created_at: '2026-01-01T00:00:00Z', retry_count: 0, max_retries: 2 }]);
  const r = await bridge.runOnce('test-worker', sb);
  assert.equal(r.status, 'failed', 'an unknown/invalid command must fail immediately, not retry-loop forever');
  const row = sb.rows.find((x) => x.id === 'bad-1');
  assert.equal(row.status, 'failed');
  assert.equal(row.retry_count, 0, 'non-retriable failures must not consume retry budget');
});

test('runOnce: a bad scriptId is a validation error, not a retriable one - fails immediately', async () => {
  releaseAnyStrayLease();
  const sb = fakeSupabase([{ id: 'bad-2', status: 'queued', command: 'run_existing_script', args: { scriptId: 'does-not-exist' }, created_at: '2026-01-01T00:00:00Z', retry_count: 0, max_retries: 2 }]);
  const r = await bridge.runOnce('test-worker', sb);
  assert.equal(r.status, 'failed');
  assert.equal(sb.rows[0].retry_count, 0, 'an scriptId that will never exist on retry must not burn retry budget');
});

test('decideOutcomeStatus: pure retry/dead-letter state machine, exactly as runOnce uses it', () => {
  const d = bridge.decideOutcomeStatus;
  assert.equal(d({ ok: true, retryCount: 0, maxRetries: 2 }), 'done');
  assert.equal(d({ ok: false, needsApproval: true, retryCount: 0, maxRetries: 2 }), 'rejected', 'approval-required must never silently retry-loop');
  assert.equal(d({ ok: false, retriable: false, retryCount: 0, maxRetries: 2 }), 'failed', 'non-retriable (validation/policy) errors fail immediately regardless of budget');
  assert.equal(d({ ok: false, retriable: true, retryCount: 0, maxRetries: 2 }), 'retry-queued');
  assert.equal(d({ ok: false, retriable: true, retryCount: 1, maxRetries: 2 }), 'retry-queued', 'still under budget');
  assert.equal(d({ ok: false, retriable: true, retryCount: 2, maxRetries: 2 }), 'dead_letter', 'budget exhausted - must land in dead_letter, never vanish as plain failed');
  assert.equal(d({ ok: false, retryCount: 5, maxRetries: 2 }), 'dead_letter', 'retriable undefined (unhandled exception path) defaults to retriable, same as production');
});

test('runOnce: a transient Supabase failure backs off gracefully instead of crashing the watch loop', async () => {
  releaseAnyStrayLease();
  const brokenSupabase = { from() { return { select() { return this; }, eq() { return this; }, in() { return this; }, lt() { return this; }, order() { return this; }, limit() { return this; }, then(_resolve, reject) { reject(new Error('ECONNRESET: simulated Supabase network blip')); } }; } };
  const r = await bridge.runOnce('test-worker', brokenSupabase);
  assert.equal(r.drained, false);
  assert.match(r.reason, /supabase error/i);
  // the lease must still be released so the next real cycle isn't blocked forever by this failed one
  const reacquire = collectiveBrain.acquireLease(ROOT, 'remote-bridge-worker', { owner: 'post-failure-check' });
  assert.ok(reacquire.ok, 'lease must be released even when the cycle errors out');
  collectiveBrain.releaseLease(ROOT, 'remote-bridge-worker', 'post-failure-check');
});

test('runOnce: route_goal wraps the real routeTask() recommendation', async () => {
  releaseAnyStrayLease();
  const sb = fakeSupabase([{ id: 'route-1', status: 'queued', command: 'route_goal', args: { goal: 'refactor and add tests for the patch module' }, created_at: '2026-01-01T00:00:00Z', retry_count: 0, max_retries: 2 }]);
  const r = await bridge.runOnce('test-worker', sb);
  assert.equal(r.status, 'done');
  const row = sb.rows.find((x) => x.id === 'route-1');
  assert.ok(row.result.route && row.result.route.primary, 'must return a real ranked primary agent, not a stub');
});

test('knownIssueMatches: a real known-issue symptom surfaces its real recorded fix (uses the actual repo registry, not a fixture)', () => {
  const matches = bridge.knownIssueMatches('controls feel inverted after camera yaw changes');
  assert.ok(matches.length > 0, 'should match the real controls-inverted-camera-relative entry');
  assert.ok(matches.some((m) => m.id === 'controls-inverted-camera-relative'));
});

test('knownIssueMatches: gibberish with no real overlap matches nothing (no false positives)', () => {
  const matches = bridge.knownIssueMatches('zzqx flibbertigibbet qwzxjk vroomfondel');
  assert.equal(matches.length, 0);
});

test('watchdog: isAlive correctly distinguishes a real running PID from a fake one', () => {
  const watchdog = require('../scripts/collective-brain-remote-bridge-watchdog.js');
  assert.equal(watchdog.isAlive(process.pid), true, 'this test process itself must read as alive');
  assert.equal(watchdog.isAlive(999999999), false, 'an implausible PID must read as not alive');
  assert.equal(watchdog.isAlive(null), false);
});

test('watchdog: --healthcheck CLI is read-only and returns well-formed JSON without throwing', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'collective-brain-remote-bridge-watchdog.js'), '--healthcheck'], { encoding: 'utf8', timeout: 15000 });
  assert.equal(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok(typeof parsed.healthy === 'boolean');
  assert.ok(typeof parsed.alive === 'boolean');
});
