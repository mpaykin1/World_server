'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { run, selftest, continuityValid, PRODUCTION, SELFTEST } = require('../scripts/long-soak-runner.cjs');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lsoak-'));
const HEARTBEAT_MS = 60000; // 60s: deterministic test window

function reportFile(name) { return path.resolve(TMP, name); }

function writeState(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

function cleanup() {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { /* ignore */ }
}

// state.json lives under STATE_DIR (.world-server-state/long-soak) in real runs;
// for the unit tests we use explicit temp state paths so we don't touch repo state.

test('bare no-arg launch defaults to selftest and can NEVER certify as production', async () => {
  const r = await selftest();
  assert.strictEqual(r.mode, SELFTEST, 'selftest must run in selftest mode');
  assert.strictEqual(r.longSoakCertified, false, 'selftest/smoke must never certify long soak');
  assert.ok(r.smokeHarnessVerified, 'smoke harness should be verified by selftest');
});

test('a selftest-mode state is NOT a valid continuity base for a production run', () => {
  const now = Date.now();
  const fresh = now - 1000;
  const st = {
    schemaVersion: '7.7.0',
    mode: SELFTEST,
    pid: 12345,
    startedAt: new Date(now - 9 * 3600000).toISOString(),
    lastHeartbeatAt: new Date(fresh).toISOString(),
    updatedAt: new Date(fresh).toISOString(),
    events: []
  };
  // Even with a fresh heartbeat, a selftest-mode state must not carry into production.
  assert.strictEqual(continuityValid(st, now, HEARTBEAT_MS), false,
    'selftest-mode state must never be resumed as production');
});

test('production resume does NOT falsely certify after a heartbeat gap (downtime not counted)', async () => {
  const statePath = path.join(TMP, 'stale-gap.json');
  const report = reportFile('stale-gap-report.json');
  const now = Date.now();
  // started 9h ago (would naively satisfy 8h), but last heartbeat is 2h stale:
  // the process crashed/restarted and was down well beyond the safe threshold.
  writeState(statePath, {
    schemaVersion: '7.7.0',
    mode: PRODUCTION,
    pid: 999,
    startedAt: new Date(now - 9 * 3600000).toISOString(),
    lastHeartbeatAt: new Date(now - 2 * 3600000).toISOString(),
    updatedAt: new Date(now - 2 * 3600000).toISOString(),
    targetDurationSeconds: 28800,
    activeElapsedSeconds: 7 * 3600,
    events: [{ type: 'child-crash', recovered: true, at: new Date(now - 9 * 3600000).toISOString() }],
    consecutiveFailures: 0
  });

  const r = await run({
    seconds: 0.005, // tiny target so the loop terminates quickly
    intervalMs: 1,
    resume: true,
    statePath,
    reportFile: path.relative(process.cwd(), report),
    heartbeatTimeoutMs: HEARTBEAT_MS
  });

  // The elapsed 9h must NOT carry over; continuity was invalidated -> fresh start.
  assert.ok(r.activeElapsedSeconds < 60, `elapsed must reset after a gap, got ${r.activeElapsedSeconds}s`);
  assert.strictEqual(r.longSoakCertified, false, 'must NOT certify 8h after a downtime gap');
});

test('production resume DOES preserve elapsed for a genuinely continuous prior', async () => {
  const statePath = path.join(TMP, 'continuous.json');
  const report = reportFile('continuous-report.json');
  const now = Date.now();
  // Genuinely continuous production run: started 9h ago with fresh heartbeat.
  writeState(statePath, {
    schemaVersion: '7.7.0',
    mode: PRODUCTION,
    pid: 4242,
    startedAt: new Date(now - 9 * 3600000).toISOString(),
    lastHeartbeatAt: new Date(now - 1000).toISOString(),
    updatedAt: new Date(now - 1000).toISOString(),
    targetDurationSeconds: 28800,
    activeElapsedSeconds: 9 * 3600,
    events: [{ type: 'child-crash', recovered: true, at: new Date(now - 9 * 3600000).toISOString() }],
    consecutiveFailures: 0
  });

  const r = await run({
    seconds: 0.005,
    intervalMs: 1,
    resume: true,
    statePath,
    reportFile: path.relative(process.cwd(), report),
    heartbeatTimeoutMs: HEARTBEAT_MS
  });

  assert.ok(r.activeElapsedSeconds >= 9 * 3600 - 60, 'continuous elapsed must carry forward');
  assert.strictEqual(r.longSoakCertified, true, 'continuous 9h production evidence is legitimately certifiable');
});

test('a fresh real run starts from zero (no inherited elapsed by default)', async () => {
  const statePath = path.join(TMP, 'fresh.json');
  const report = reportFile('fresh-report.json');
  const r = await run({
    seconds: 0.005,
    intervalMs: 1,
    resume: false,
    statePath,
    reportFile: path.relative(process.cwd(), report),
    heartbeatTimeoutMs: HEARTBEAT_MS
  });
  assert.ok(r.activeElapsedSeconds < 60, 'fresh run must start from ~zero');
  assert.strictEqual(r.longSoakCertified, false, 'fresh short run cannot certify');
  // production heartbeat evidence must be persisted
  const st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.strictEqual(st.mode, PRODUCTION);
  assert.ok(st.pid && st.startedAt && st.lastHeartbeatAt && st.targetDurationSeconds != null,
    'heartbeat must persist pid/startedAt/lastHeartbeatAt/targetDuration/activeElapsed');
  assert.ok(st.activeElapsedSeconds != null, 'activeElapsedSeconds evidence required');
});

test.after(() => cleanup());
