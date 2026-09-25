'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const quota = require('../lib/codex-work-quota');

const NOW = new Date('2026-09-24T12:00:00.000Z');

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-codex-quota-'));
  return path.join(dir, 'ai-agent-reports.jsonl');
}

function writeLog(logPath, entries) {
  fs.writeFileSync(logPath, entries.map((e) => typeof e === 'string' ? e : JSON.stringify(e)).join('\n') + '\n');
}

function line(agent, at, extra = {}) {
  return { at, agent, status: 'done', ...extra };
}

test('loadPolicy reads the committed default quota policy', () => {
  const p = quota.loadPolicy();
  assert.equal(p.measuredAgentId, 'codex');
  assert.ok(p.windowHours > 0);
  assert.ok(p.maxSharePct > 0);
});

test('loadPolicy falls back to a safe builtin default when the policy JSON is absent or broken', () => {
  const missing = quota.loadPolicy(path.join(os.tmpdir(), 'no-such-codex-quota-policy.json'));
  assert.equal(missing.windowHours, 24);
  assert.equal(missing.maxSharePct, 30);
  assert.equal(missing.measuredAgentId, 'codex');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-codex-badpolicy-'));
  const badPath = path.join(dir, 'policy.json');
  fs.writeFileSync(badPath, '{not-json');
  const broken = quota.loadPolicy(badPath);
  assert.equal(broken.windowHours, 24);
  assert.equal(broken.maxSharePct, 30);
});

test('loadAgentWork counts only entries inside the configured 24h window', () => {
  const logPath = fixture();
  writeLog(logPath, [
    line('codex', '2026-09-24T11:59:00.000Z'),
    line('opencode', '2026-09-24T11:30:00.000Z'),
    line('codex', '2026-09-23T11:59:00.000Z'),
    line('codex', '2026-09-25T00:00:00.000Z'),
  ]);
  const entries = quota.loadAgentWork(logPath, { now: NOW, windowHours: 24 });
  assert.equal(entries.length, 2);
});

test('loadAgentWork ignores malformed lines and a missing log file yields an empty list', () => {
  const logPath = fixture();
  writeLog(logPath, [line('codex', '2026-09-24T11:00:00.000Z'), 'not-json']);
  assert.equal(quota.loadAgentWork(logPath, { now: NOW, windowHours: 24 }).length, 1);
  assert.equal(quota.loadAgentWork(path.join(os.tmpdir(), 'no-such-log.jsonl'), { now: NOW }).length, 0);
});

test('computeShare reports counts and rounded sharePct', () => {
  assert.deepEqual(quota.computeShare([]), { totalCount: 0, measuredCount: 0, sharePct: 0 });
  assert.deepEqual(quota.computeShare(['codex', 'opencode', 'openhuman', 'codex']), { totalCount: 4, measuredCount: 2, sharePct: 50 });
});

test('evaluation allows dispatch when the share is at the cap (at or below 30%)', () => {
  const logPath = fixture();
  const entries = [];
  for (let i = 0; i < 12; i++) entries.push(line('codex', '2026-09-24T10:00:00.000Z'));
  for (let i = 0; i < 28; i++) entries.push(line('opencode', '2026-09-24T10:05:00.000Z'));
  writeLog(logPath, entries);
  const r = quota.evaluateCodexDispatch({ logPath, policy: { windowHours: 24, maxSharePct: 30, measuredAgentId: 'codex' }, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.result, 'ALLOWED');
  assert.equal(r.sharePct, 30);
  assert.equal(r.unverified, false);
});

test('evaluation refuses dispatch above the cap with an exact reason', () => {
  const logPath = fixture();
  const entries = [];
  for (let i = 0; i < 21; i++) entries.push(line('codex', '2026-09-24T10:00:00.000Z'));
  for (let i = 0; i < 29; i++) entries.push(line('opencode', '2026-09-24T10:05:00.000Z'));
  writeLog(logPath, entries);
  const r = quota.evaluateCodexDispatch({ logPath, policy: { windowHours: 24, maxSharePct: 30, measuredAgentId: 'codex' }, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.result, 'CODEX_QUOTA_EXCEEDED');
  assert.equal(r.action, 'refuse');
  assert.ok(r.reason.includes('42'));
});

test('no logged work reports an UNKNOWN basis (unverified) and is never certified as a pass', () => {
  const r = quota.evaluateCodexDispatch({ logPath: path.join(os.tmpdir(), 'empty-log.jsonl'), policy: { windowHours: 24, maxSharePct: 30, measuredAgentId: 'codex' }, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.sharePct, 0);
  assert.equal(r.unverified, true);
});

test('non-codex agents never count against the cap', () => {
  const logPath = fixture();
  const entries = [];
  for (let i = 0; i < 100; i++) entries.push(line('opencode', '2026-09-24T10:00:00.000Z'));
  writeLog(logPath, entries);
  const r = quota.evaluateCodexDispatch({ logPath, policy: { windowHours: 24, maxSharePct: 30, measuredAgentId: 'codex' }, now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.measuredCount, 0);
  assert.equal(r.sharePct, 0);
});

test('measuredAgentId comes from the policy, so the same log can measure any agent', () => {
  const logPath = fixture();
  writeLog(logPath, [line('codex', '2026-09-24T10:00:00.000Z'), line('codex', '2026-09-24T10:01:00.000Z')]);
  const asCodex = quota.evaluateCodexDispatch({ logPath, policy: { windowHours: 24, maxSharePct: 30, measuredAgentId: 'codex' }, now: NOW });
  assert.equal(asCodex.measuredCount, 2);
  const asOpencode = quota.evaluateCodexDispatch({ logPath, policy: { windowHours: 24, maxSharePct: 30, measuredAgentId: 'opencode' }, now: NOW });
  assert.equal(asOpencode.measuredCount, 0);
});

test('the committed policy file stays in sync with the enforced defaults', () => {
  const p = quota.loadPolicy();
  const evalNow = quota.evaluateCodexDispatch({ logPath: path.join(os.tmpdir(), 'empty-log.jsonl'), now: NOW });
  assert.equal(evalNow.windowHours, p.windowHours);
  assert.equal(evalNow.maxSharePct, p.maxSharePct);
});