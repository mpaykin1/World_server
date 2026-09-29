'use strict';
// Regression tests for lib/agent-daily-quota.js - the evidence-backed
// enforcements of the master-goal rule "Codex is fallback only and must stay
// at or below 30 percent of daily AI-agent work".

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const quota = require('../lib/agent-daily-quota');

function mkLog() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-agent-daily-quota-'));
  return path.join(dir, 'ai-agent-reports.jsonl');
}

function line(agent, atMs, status = 'done') {
  return JSON.stringify({ at: new Date(atMs).toISOString(), agent, status }) + '\n';
}

function within(opts = {}) {
  return (opts.nowMs != null ? opts.nowMs : Date.now()) - (opts.offsetMinutes != null ? opts.offsetMinutes : 5) * 60 * 1000;
}

function writeEntries(logPath, linesArr) {
  fs.writeFileSync(logPath, linesArr.join(''));
}

function withEnv(name, value, fn) {
  const prev = process.env[name];
  if (value == null) delete process.env[name];
  else process.env[name] = value;
  try {
    return fn();
  } finally {
    if (prev == null) delete process.env[name];
    else process.env[name] = prev;
  }
}

test('missing report log is a zero-cost environment: gate passes with share 0', () => {
  const g = quota.gateCodexDispatch({ logPath: mkLog() });
  assert.equal(g.ok, true);
  assert.equal(g.result, 'PASS');
  assert.equal(g.data.totalCount, 0);
  assert.equal(g.data.share, 0);
  assert.equal(g.data.loaded, false);
});

test('empty report log passes', () => {
  const logPath = mkLog();
  writeEntries(logPath, []);
  const g = quota.gateCodexDispatch({ logPath });
  assert.equal(g.ok, true);
  assert.equal(g.data.totalCount, 0);
});

test('below-cap daily share (20% codex) is allowed', () => {
  const logPath = mkLog();
  const now = Date.now();
  const entries = [
    line('codex', within({ nowMs: now, offsetMinutes: 1 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 2 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 3 })),
    line('world-cloud-ai', within({ nowMs: now, offsetMinutes: 4 })),
    line('openhuman', within({ nowMs: now, offsetMinutes: 5 })),
  ];
  writeEntries(logPath, entries);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.ok, true);
  assert.equal(g.data.totalCount, 5);
  assert.equal(g.data.codexCount, 1);
  assert.equal(g.data.share, 0.2);
});

test('exactly at cap (30% codex) is allowed - the rule is at-or-below', () => {
  const logPath = mkLog();
  const now = Date.now();
  const entries = [];
  for (let n = 1; n <= 3; n++) entries.push(line('codex', within({ nowMs: now, offsetMinutes: n })));
  for (let n = 4; n <= 10; n++) entries.push(line('opencode', within({ nowMs: now, offsetMinutes: n })));
  writeEntries(logPath, entries);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.ok, true);
  assert.equal(g.data.share, 0.3);
});

test('above cap (40% codex) is blocked with CODEX_DAILY_QUOTA_EXCEEDED and precise reason', () => {
  const logPath = mkLog();
  const now = Date.now();
  const entries = [];
  for (let n = 1; n <= 4; n++) entries.push(line('codex', within({ nowMs: now, offsetMinutes: n })));
  for (let n = 5; n <= 10; n++) entries.push(line('opencode', within({ nowMs: now, offsetMinutes: n })));
  writeEntries(logPath, entries);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.ok, false);
  assert.equal(g.result, 'CODEX_DAILY_QUOTA_EXCEEDED');
  assert.equal(g.data.share, 0.4);
  assert.equal(g.data.maxShare, 0.3);
  assert.match(g.reason, /40%/);
  assert.match(g.reason, /30%/);
});

test('100% codex share is blocked', () => {
  const logPath = mkLog();
  const now = Date.now();
  writeEntries(logPath, [line('codex', within({ nowMs: now, offsetMinutes: 1 })), line('codex', within({ nowMs: now, offsetMinutes: 2 }))]);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.ok, false);
  assert.equal(g.result, 'CODEX_DAILY_QUOTA_EXCEEDED');
});

test('entries outside the rolling window are excluded from the share', () => {
  const logPath = mkLog();
  const now = Date.now();
  const old = now - 25 * 60 * 60 * 1000;
  const entries = [];
  for (let n = 1; n <= 9; n++) entries.push(line('codex', old + n * 1000));
  entries.push(line('opencode', within({ nowMs: now, offsetMinutes: 1 })));
  writeEntries(logPath, entries);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.data.totalCount, 1);
  assert.equal(g.data.codexCount, 0);
  assert.equal(g.ok, true);
});

test('future-dated entries are excluded', () => {
  const logPath = mkLog();
  const now = Date.now();
  writeEntries(logPath, [line('codex', now + 5 * 60 * 60 * 1000), line('opencode', within({ nowMs: now, offsetMinutes: 1 }))]);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.data.totalCount, 1);
  assert.equal(g.ok, true);
});

test('malformed lines never decide quota math and are silently skipped', () => {
  const logPath = mkLog();
  const now = Date.now();
  const entries = [
    'not json at all\n',
    '{"at":"2026-09-25T00:00:00Z"}\n',
    '{"agent":42,"at":"2026-09-25T00:00:00Z"}\n',
    '{"agent":"codex","at":"not-a-date"}\n',
    line('codex', within({ nowMs: now, offsetMinutes: 1 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 2 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 3 })),
    line('openhuman', within({ nowMs: now, offsetMinutes: 4 })),
  ];
  writeEntries(logPath, entries);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.data.totalCount, 4);
  assert.equal(g.data.codexCount, 1);
  assert.equal(g.ok, true);
});

test('every recorded status counts as AI-agent work', () => {
  const logPath = mkLog();
  const now = Date.now();
  const entries = [
    line('codex', within({ nowMs: now, offsetMinutes: 1 }), 'done'),
    line('codex', within({ nowMs: now, offsetMinutes: 2 }), 'queued'),
    line('codex', within({ nowMs: now, offsetMinutes: 3 }), 'failed'),
    line('opencode', within({ nowMs: now, offsetMinutes: 4 })),
  ];
  writeEntries(logPath, entries);
  const g = quota.gateCodexDispatch({ logPath, nowMs: now });
  assert.equal(g.data.totalCount, 4);
  assert.equal(g.data.codexCount, 3);
  assert.equal(g.ok, false);
});

test('explicit windowHours and nowMs are honored', () => {
  const logPath = mkLog();
  const now = Date.now();
  writeEntries(logPath, [line('codex', now - 2 * 60 * 60 * 1000), line('opencode', within({ nowMs: now, offsetMinutes: 1 }))]);
  const wide = quota.dailyShares(logPath, { nowMs: now, windowHours: 6 });
  const narrow = quota.dailyShares(logPath, { nowMs: now, windowHours: 1 });
  assert.equal(wide.totalCount, 2);
  assert.equal(narrow.totalCount, 1);
  assert.equal(wide.share, 0.5);
  assert.equal(narrow.share, 0);
});

test('explicit opts.maxShare takes precedence over the environment and allows a wider cap', () => {
  const logPath = mkLog();
  const now = Date.now();
  writeEntries(logPath, [
    line('codex', within({ nowMs: now, offsetMinutes: 1 })),
    line('codex', within({ nowMs: now, offsetMinutes: 2 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 3 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 4 })),
    line('openhuman', within({ nowMs: now, offsetMinutes: 5 })),
  ]);
  const g = withEnv('MASTER_COORDINATOR_CODEX_MAX_SHARE', '0.1', () => quota.gateCodexDispatch({ logPath, nowMs: now, maxShare: 0.5 }));
  assert.equal(g.ok, true);
  assert.equal(g.data.share, 0.4);
  assert.equal(g.data.maxShare, 0.5);
});

test('environment override MASTER_COORDINATOR_CODEX_MAX_SHARE widens/narrows the cap', () => {
  const logPath = mkLog();
  const now = Date.now();
  writeEntries(logPath, [
    line('codex', within({ nowMs: now, offsetMinutes: 1 })),
    line('codex', within({ nowMs: now, offsetMinutes: 2 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 3 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 4 })),
    line('openhuman', within({ nowMs: now, offsetMinutes: 5 })),
  ]);
  const wide = withEnv('MASTER_COORDINATOR_CODEX_MAX_SHARE', '0.5', () => quota.gateCodexDispatch({ logPath, nowMs: now }));
  assert.equal(wide.ok, true);
  assert.equal(wide.data.share, 0.4);
  const narrow = withEnv('MASTER_COORDINATOR_CODEX_MAX_SHARE', '0.1', () => quota.gateCodexDispatch({ logPath, nowMs: now }));
  assert.equal(narrow.ok, false);
  assert.equal(narrow.result, 'CODEX_DAILY_QUOTA_EXCEEDED');
});

test('invalid environment values fall back to the 30% default', () => {
  const logPath = mkLog();
  const now = Date.now();
  writeEntries(logPath, [
    line('codex', within({ nowMs: now, offsetMinutes: 1 })),
    line('codex', within({ nowMs: now, offsetMinutes: 2 })),
    line('opencode', within({ nowMs: now, offsetMinutes: 3 })),
  ]);
  const g = withEnv('MASTER_COORDINATOR_CODEX_MAX_SHARE', 'not-a-number', () => quota.gateCodexDispatch({ logPath, nowMs: now }));
  assert.equal(g.data.maxShare, quota.DEFAULT_MAX_SHARE);
  assert.equal(g.ok, false);
});

test('parseMaxShare and parseWindowHours reject out-of-range or non-numeric inputs', () => {
  assert.equal(quota.parseMaxShare({ maxShare: 0.25 }), 0.25);
  assert.equal(quota.parseMaxShare({ maxShare: -1 }), quota.DEFAULT_MAX_SHARE);
  assert.equal(quota.parseMaxShare({ maxShare: 1.5 }), quota.DEFAULT_MAX_SHARE);
  assert.equal(quota.parseMaxShare({ maxShare: 'abc' }), quota.DEFAULT_MAX_SHARE);
  assert.equal(quota.parseWindowHours({ windowHours: 12 }), 12);
  assert.equal(quota.parseWindowHours({ windowHours: 0 }), quota.DEFAULT_WINDOW_HOURS);
  assert.equal(quota.parseWindowHours({ windowHours: -4 }), quota.DEFAULT_WINDOW_HOURS);
});

test('defaults are 30% cap over a 24h window and can be read through the module', () => {
  assert.equal(quota.DEFAULT_MAX_SHARE, 0.3);
  assert.equal(quota.DEFAULT_WINDOW_HOURS, 24);
});