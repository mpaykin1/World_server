'use strict';
// Regression tests for lib/agent-work-ledger.js - the pure accounting core of
// the master-goal work-governance policy (Codex <=30% of daily AI-agent work,
// no programmatic ChatGPT Work / Computer Use, UNKNOWN-not-PASS on missing
// evidence).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ledger = require('../lib/agent-work-ledger');

function policy(cap = 0.3) {
  return {
    codexDailyShareCap: cap,
    enforceCodexDispatchCap: true,
    agentCostClasses: {
      free: ['opencode', 'openhuman', 'anythingllm', 'world-cloud-ai', 'claude-code', 'desktop-ai', 'ollama'],
      paidFallback: ['codex'],
      offlineOnly: ['chatgpt', 'claude-desktop'],
    },
    refusedWorkStatuses: ['PAID_FALLBACK_DISABLED', 'NOT_AVAILABLE', 'UNKNOWN_AGENT', 'CODEX_DAILY_CAP_EXCEEDED'],
    automatedWorkStatuses: ['done', 'failed', 'queued', 'assigned', 'claimed', 'completed', 'in_progress'],
  };
}

function mkLog(lines) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-ledger-')), 'ai-agent-reports.jsonl');
  fs.writeFileSync(file, lines.join('\n') + (lines.length ? '\n' : ''));
  return file;
}

function entry(at, agent, status, resultTag) {
  const e = { at, agent, task_id: `t-${agent}-${Date.now()}`, status, merge_safe: false, findings: { task: 'x' } };
  if (resultTag) e.findings.result = resultTag;
  return JSON.stringify(e);
}

test('loadPolicy reads the canonical policy; a missing/unreadable policy throws (gate must fail loud, not guess)', () => {
  const p2 = ledger.loadPolicy(path.resolve(__dirname, '..', 'data', 'master-goal-policy.json'));
  assert.equal(p2.codexDailyShareCap, 0.3);
  assert.equal(p2.policyId, 'master-goal-work-governance');
  assert.throws(() => ledger.loadPolicy(path.join(__dirname, 'fixtures', 'does-not-exist.json')));
});

test('classifyAgent maps free, paid-fallback, offline and unknown classes', () => {
  const p = policy();
  assert.equal(ledger.classifyAgent('opencode', p).costClass, 'free');
  assert.equal(ledger.classifyAgent('world-cloud-ai', p).costClass, 'free');
  assert.equal(ledger.classifyAgent('codex', p).costClass, 'paid-fallback');
  assert.equal(ledger.classifyAgent('chatgpt', p).costClass, 'offline');
  assert.equal(ledger.classifyAgent('brand-new-agent', p).costClass, 'unknown');
});

test('readReportRecords parses valid lines, counts malformed lines, never crashes', () => {
  const file = mkLog([
    entry('2026-09-24T10:00:00Z', 'opencode', 'done'),
    'this is not json {',
    entry('2026-09-24T10:05:00Z', 'codex', 'queued'),
    '',
    '{}',
  ]);
  const { records, invalidLines } = ledger.readReportRecords(file);
  assert.equal(records.length, 3);
  assert.equal(invalidLines, 1);
  assert.equal(ledger.readReportRecords(path.join(file, '..', 'missing.log')).missing, true);
});

test('workCounts excludes refused outcomes and counts assigned offline work as real agent work', () => {
  const p = policy();
  const records = [
    JSON.parse(entry('2026-09-24T09:00:00Z', 'codex', 'queued', 'PAID_FALLBACK_DISABLED')), // never dispatched
    JSON.parse(entry('2026-09-24T09:01:00Z', 'codex', 'failed')), // really ran (and failed) -> counts
    JSON.parse(entry('2026-09-24T09:02:00Z', 'opencode', 'done')),
    JSON.parse(entry('2026-09-24T09:03:00Z', 'chatgpt', 'assigned')), // offline queue -> counts as work
    JSON.parse(entry('2026-09-24T09:04:00Z', 'new-agent-x', 'done')), // unknown class but real work
  ];
  const counts = ledger.workCounts(records, p);
  assert.equal(counts.totalCount, 4);
  assert.equal(counts.codexCount, 1);
  assert.equal(counts.unknownClassCount, 1);
});

test('codexShare: absent evidence is UNKNOWN; measured share below/at cap PASS; above cap FAIL', () => {
  const p = policy(0.3);
  assert.equal(ledger.codexShare([], p).state, 'UNKNOWN');
  assert.equal(ledger.codexShare([JSON.parse(entry('2026-09-24T09:00:00Z', 'opencode', 'done'))], p).state, 'PASS');

  const atCap = [];
  for (let i = 0; i < 7; i++) atCap.push(JSON.parse(entry(`2026-09-24T0${i}:00:00Z`, 'opencode', 'done')));
  for (let i = 0; i < 3; i++) atCap.push(JSON.parse(entry(`2026-09-24T1${i}:00:00Z`, 'codex', 'done')));
  assert.equal(ledger.codexShare(atCap, p).state, 'PASS'); // 3/10 == 0.30
  assert.equal(ledger.codexShare(atCap, p).share, 0.3);

  const overCap = [];
  for (let i = 0; i < 6; i++) overCap.push(JSON.parse(entry(`2026-09-24T0${i}:00:00Z`, 'opencode', 'done')));
  for (let i = 0; i < 4; i++) overCap.push(JSON.parse(entry(`2026-09-24T1${i}:00:00Z`, 'codex', 'done')));
  const fail = ledger.codexShare(overCap, p);
  assert.equal(fail.state, 'FAIL');
  assert.equal(fail.share, 0.4);
});

test('dailyRecords filters strictly to the UTC day', () => {
  const records = [
    JSON.parse(entry('2026-09-23T23:59:59Z', 'opencode', 'done')),
    JSON.parse(entry('2026-09-24T00:00:00Z', 'opencode', 'done')),
    JSON.parse(entry('2026-09-24T23:59:59Z', 'codex', 'done')),
    JSON.parse(entry('2026-09-25T00:00:00Z', 'opencode', 'done')),
  ];
  const today = ledger.dailyRecords(records, '2026-09-24T12:00:00Z');
  assert.equal(today.length, 2);
});

test('codexDispatchAllowed: first of the day allowed, boundary at cap allowed, over-cap blocked', () => {
  const p = policy(0.3);
  const first = ledger.codexDispatchAllowed({ codexCount: 0, totalCount: 0 }, p);
  assert.equal(first.ok, true); // a single task cannot violate a share

  const boundary = ledger.codexDispatchAllowed({ codexCount: 2, totalCount: 9 }, p); // 3/10 = 0.30
  assert.equal(boundary.ok, true);
  assert.equal(boundary.projectedShare, 0.3);

  const blocked = ledger.codexDispatchAllowed({ codexCount: 3, totalCount: 10 }, p); // 4/11 = 0.3636
  assert.equal(blocked.ok, false);
  assert.ok(blocked.reason.includes('cap'));
});

test('codexDispatchGate: missing log allows (no evidence), measured over-cap dispatch refuses, under-cap allows', () => {
  const p = policy(0.3);
  const missing = ledger.codexDispatchGate(path.join(os.tmpdir(), 'no-such-report.jsonl'), p);
  assert.equal(missing.result, 'ALLOWED');
  assert.equal(missing.logState, 'missing');

  const overCapLines = [];
  for (let i = 0; i < 6; i++) overCapLines.push(entry(`2026-09-24T0${i}:00:00Z`, 'opencode', 'done'));
  for (let i = 0; i < 4; i++) overCapLines.push(entry(`2026-09-24T1${i}:00:00Z`, 'codex', 'done'));
  const overFile = mkLog(overCapLines);
  const refused = ledger.codexDispatchGate(overFile, p);
  assert.equal(refused.result, 'CODEX_DAILY_CAP_EXCEEDED');
  assert.equal(refused.projectedShare > 0.3, true);

  const underCapLines = [];
  for (let i = 0; i < 9; i++) underCapLines.push(entry(`2026-09-24T0${i}:00:00Z`, 'opencode', 'done'));
  const underFile = mkLog(underCapLines);
  const allowed = ledger.codexDispatchGate(underFile, p);
  assert.equal(allowed.result, 'ALLOWED');
  assert.equal(allowed.ok, true);
});

test('a disabled cap (enforceCodexDispatchCap=false) always allows dispatch', () => {
  const p = { ...policy(0.3), enforceCodexDispatchCap: false };
  const overCapLines = [];
  for (let i = 0; i < 4; i++) overCapLines.push(entry(`2026-09-24T1${i}:00:00Z`, 'codex', 'done'));
  const r = ledger.codexDispatchGate(mkLog(overCapLines), p);
  assert.equal(r.result, 'ALLOWED');
  assert.equal(r.enforced, false);
});