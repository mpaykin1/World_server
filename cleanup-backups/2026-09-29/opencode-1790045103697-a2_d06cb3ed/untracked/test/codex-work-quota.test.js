'use strict';
// Regression tests for lib/codex-work-quota.js - the master-goal rule that
// Codex is a paid fallback only and must stay at or below 30 percent of
// daily AI-agent work. Pure, deterministic, no I/O beyond fixture temp files
// so the rule's exact boundary ("at or below") is pinned down forever.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readAgentReports,
  isWorkEntry,
  dailyCounts,
  decideFromEntries,
  codexDispatchDecision,
  DEFAULT_MAX_DAILY_SHARE,
} = require('../lib/codex-work-quota');

const NOW = Date.parse('2026-09-22T12:00:00.000Z');

function entry(agent, at, status = 'done') {
  return { at: at.toISOString(), agent, status };
}

function tmpLog(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-codex-quota-'));
  const file = path.join(dir, 'ai-agent-reports.jsonl');
  if (lines.length) fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

test('DEFAULT_MAX_DAILY_SHARE is exactly 0.30 (the documented cap)', () => {
  assert.equal(DEFAULT_MAX_DAILY_SHARE, 0.3);
});

test('missing or empty ledger => first Codex dispatch is allowed (no baseline yet)', () => {
  const d = decideFromEntries([], { now: NOW });
  assert.equal(d.allowed, true);
  assert.equal(d.total, 0);
  assert.equal(d.codex, 0);
  assert.equal(d.share, 0);
});

test('exactly 30% is still allowed ("at or below 30 percent")', () => {
  const entries = [
    entry('codex', new Date(NOW - 3600000)),
    entry('codex', new Date(NOW - 7200000)),
    entry('codex', new Date(NOW - 10800000)),
    entry('opencode', new Date(NOW - 14400000)),
    entry('claude-code', new Date(NOW - 18000000)),
    entry('opencode', new Date(NOW - 21600000)),
    entry('openhuman', new Date(NOW - 25200000)),
    entry('opencode', new Date(NOW - 28800000)),
    entry('claude-code', new Date(NOW - 32400000)),
    entry('world-cloud-ai', new Date(NOW - 36000000)),
  ];
  const d = decideFromEntries(entries, { now: NOW });
  assert.equal(d.total, 10);
  assert.equal(d.codex, 3);
  assert.ok(Math.abs(d.share - 0.3) < 1e-9);
  assert.equal(d.allowed, true);
});

test('share above 30% is blocked', () => {
  const entries = [
    entry('codex', new Date(NOW - 3600000)),
    entry('codex', new Date(NOW - 7200000)),
    entry('codex', new Date(NOW - 10800000)),
    entry('codex', new Date(NOW - 14400000)),
    entry('opencode', new Date(NOW - 18000000)),
    entry('claude-code', new Date(NOW - 21600000)),
  ];
  const d = decideFromEntries(entries, { now: NOW });
  assert.equal(d.total, 6);
  assert.equal(d.codex, 4);
  assert.equal(d.allowed, false);
  assert.match(d.reason, /above the 30% daily cap/);
});

test('only dispatched work (done/failed) counts; queued and assigned do not', () => {
  const entries = [
    entry('codex', new Date(NOW - 3600000), 'done'),
    entry('codex', new Date(NOW - 7200000), 'failed'),
    entry('codex', new Date(NOW - 10800000), 'queued'),
    { at: new Date(NOW - 14400000).toISOString(), agent: 'codex', status: 'assigned' },
    entry('opencode', new Date(NOW - 18000000), 'done'),
    entry('opencode', new Date(NOW - 21600000), 'queued'),
  ];
  const d = decideFromEntries(entries, { now: NOW });
  assert.equal(d.total, 3); // two codex (done/failed) + one opencode (done)
  assert.equal(d.codex, 2);
  assert.equal(d.share, 2 / 3);
  assert.equal(d.allowed, false);
});

test('a trailing 24h window: entries older than the window are never counted', () => {
  const entries = [
    entry('codex', new Date(NOW - 3600000)), // inside
    entry('codex', new Date(NOW - 24 * 3600000 - 1000)), // just outside
    entry('codex', new Date(NOW - 48 * 3600000)), // far outside
    entry('opencode', new Date(NOW - 7200000)), // inside
  ];
  const d = decideFromEntries(entries, { now: NOW });
  assert.equal(d.total, 2);
  assert.equal(d.codex, 1);
  // 1/2 inside the window is 50% -> blocked; the point here is that the two
  // stale codex entries did NOT inflate the denominator or the codex count.
  assert.equal(d.share, 0.5);
  assert.equal(d.allowed, false);
});

test('corrupt JSONL lines are ignored, never fatal and never counted', () => {
  const file = tmpLog([entry('codex', new Date(NOW - 3600000)), '{not-json', entry('opencode', new Date(NOW - 7200000))]);
  const d = codexDispatchDecision({ agentReportsPath: file, now: NOW });
  assert.equal(d.total, 2);
  assert.equal(d.codex, 1);
});

test('entries without a parseable at timestamp or agent name are not work', () => {
  assert.equal(isWorkEntry({ agent: 'codex', status: 'done' }), false, 'missing at is not a work entry');
  assert.equal(isWorkEntry({ at: new Date().toISOString(), status: 'done' }), false, 'missing agent is not a work entry');
  const d = decideFromEntries([
    entry('codex', new Date(NOW - 3600000)),
    { at: 'garbage', agent: 'codex', status: 'done' },
    { at: new Date().toISOString(), status: 'failed' },
  ], { now: NOW });
  assert.equal(d.total, 1, 'unparseable at and missing agent must not count as work');
  assert.equal(d.codex, 1);
});

test('readAgentReports returns [] for a missing file instead of throwing', () => {
  const missing = path.join(os.tmpdir(), 'does-not-exist-' + Date.now() + '.jsonl');
  assert.deepEqual(readAgentReports(missing), []);
});

test('a smaller window tightens the denominator (share is relative to the window only)', () => {
  const entries = [
    entry('codex', new Date(NOW - 3600000)),
    entry('opencode', new Date(NOW - 7200000)),
    entry('claude-code', new Date(NOW - 36 * 3600000)),
  ];
  const d24 = decideFromEntries(entries, { now: NOW, windowMs: 24 * 3600000 });
  const d48 = decideFromEntries(entries, { now: NOW, windowMs: 48 * 3600000 });
  assert.equal(d24.total, 2);
  assert.equal(d48.total, 3);
  assert.equal(d24.codex, 1);
  assert.equal(d48.codex, 1);
  // 1/2 inside a 24h window is 50% -> blocked; 1/3 inside 48h is ~33% -> still
  // blocked too; the point of this test is the DENOMINATOR (window), so the
  // share values are what must be exact, not the boolean.
  assert.equal(d24.share, 0.5);
  assert.ok(Math.abs(d48.share - 1 / 3) < 1e-9);
});

test('codexDispatchDecision requires an agentReportsPath and fails closed otherwise', () => {
  const d = codexDispatchDecision({});
  assert.equal(d.allowed, false);
  assert.ok(d.error);
});