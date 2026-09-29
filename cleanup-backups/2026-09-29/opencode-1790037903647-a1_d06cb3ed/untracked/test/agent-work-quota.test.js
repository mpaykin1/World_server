'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const quota = require('../lib/agent-work-quota');

function ledgerPath(name) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), `agent-work-quota-${name}-`)), 'work-quota.jsonl');
}

function seed(filePath, lines) {
  fs.writeFileSync(filePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
}

function entry(ts, agentId, cls, outcome = 'dispatched') {
  return { ts, agentId, cls, outcome };
}

test('defaults encode the master-goal rule: paid fallback capped at 30% over a 24h window', () => {
  assert.equal(quota.MAX_PAID_SHARE_DEFAULT, 0.3);
  assert.equal(quota.WINDOW_HOURS_DEFAULT, 24);
});

test('classForAgent marks only the explicit paid fallback (codex) as paid', () => {
  assert.equal(quota.classForAgent('codex'), 'paid');
  assert.equal(quota.classForAgent('Codex'), 'paid');
  assert.equal(quota.classForAgent('opencode'), 'free');
  assert.equal(quota.classForAgent('claude-code'), 'free');
  assert.equal(quota.classForAgent('world-cloud-ai'), 'free');
  assert.equal(quota.classForAgent('anythingllm'), 'free');
  assert.equal(quota.classForAgent('codex', 'free'), 'free');
  assert.equal(quota.classForAgent('opencode', 'paid'), 'paid');
});

test('record appends one JSONL line and a directory path fails closed without throwing', () => {
  const file = ledgerPath('roundtrip');
  assert.equal(quota.record(file, { agentId: 'opencode' }), true);
  assert.equal(quota.record(file, { agentId: 'codex', outcome: quota.OUTCOMES.DISPATCHED }), true);
  const recs = quota.readRecords(file);
  assert.equal(recs.length, 2);
  assert.equal(recs[0].agentId, 'opencode');
  assert.equal(recs[0].cls, 'free');
  assert.equal(recs[1].agentId, 'codex');
  assert.equal(recs[1].cls, 'paid');
  const dirAsFile = ledgerPath('dirfail');
  fs.rmSync(dirAsFile, { recursive: true, force: true });
  fs.mkdirSync(dirAsFile);
  assert.equal(quota.record(dirAsFile, { agentId: 'codex' }), false);
  assert.deepEqual(quota.readRecords(dirAsFile), []);
});

test('snapshot counts only in-window dispatched work and ignores blocked + malformed lines', () => {
  const file = ledgerPath('snapshot');
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  seed(file, [
    entry(now, 'opencode', 'free'),
    entry(now, 'opencode', 'free'),
    entry(now - 2 * hourMs, 'codex', 'paid'),
    entry(now - 100 * hourMs, 'codex', 'paid'),
    entry(now, 'codex', 'paid', 'blocked'),
    '{"corrupt":',
  ]);
  const s = quota.snapshot(file, { now });
  assert.equal(s.totalDispatchCount, 3);
  assert.equal(s.paidDispatchCount, 1);
  assert.equal(s.freeDispatchCount, 2);
  assert.equal(s.paidSharePercent, 33.3);
  const sAll = quota.snapshot(file, { now, windowHours: 200 });
  assert.equal(sAll.paidDispatchCount, 2, 'old paid work counts once the window is wide enough');
});

test('decidePaidDispatch blocks only when one more paid dispatch would exceed the cap', () => {
  const file = ledgerPath('decide');
  const now = Date.now();
  seed(file, [
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'codex', 'paid', 'dispatched'),
  ]);
  // 1 paid / 9 total = 11.1% -> adding one paid unit (2/10 = 20%) stays <= 30%.
  let d = quota.decidePaidDispatch(file, { now });
  assert.equal(d.blocked, false);
  assert.equal(d.wouldBePaidSharePercent, 20);
  // 3 paid / 10 total = 30% exactly -> one more (4/11 = 36.4%) exceeds the cap.
  seed(file, [
    entry(now, 'codex', 'paid', 'dispatched'),
    entry(now, 'codex', 'paid', 'dispatched'),
    entry(now, 'codex', 'paid', 'dispatched'),
  ].concat(Array.from({ length: 7 }, () => entry(now, 'opencode', 'free', 'dispatched'))));
  assert.equal(quota.snapshot(file, { now }).paidSharePercent, 30);
  d = quota.decidePaidDispatch(file, { now });
  assert.equal(d.blocked, true, 'exact-cap share must still block the very next paid dispatch');
  // 2 paid / 10 total = 20% -> one more (3/11 = 27.3%) stays under the cap.
  seed(file, [
    entry(now, 'opencode', 'free', 'dispatched'),
    entry(now, 'codex', 'paid', 'dispatched'),
    entry(now, 'codex', 'paid', 'dispatched'),
  ].concat(Array.from({ length: 7 }, () => entry(now, 'opencode', 'free', 'dispatched'))));
  d = quota.decidePaidDispatch(file, { now });
  assert.equal(d.blocked, false);
});

test('decidePaidDispatch with an empty ledger always allows the first paid dispatch', () => {
  const file = ledgerPath('empty');
  const d = quota.decidePaidDispatch(file, {});
  assert.equal(d.blocked, false);
  assert.equal(d.current.paidSharePercent, 0);
});

test('a codex-only day is capped: the first paid unit is allowed, every further one without free balance is blocked', () => {
  const file = ledgerPath('codex-only');
  const now = Date.now();
  assert.equal(quota.decidePaidDispatch(file, { now }).blocked, false);
  quota.record(file, { agentId: 'codex', at: now, outcome: quota.OUTCOMES.DISPATCHED });
  assert.equal(quota.snapshot(file, { now }).paidSharePercent, 100);
  const second = quota.decidePaidDispatch(file, { now });
  assert.equal(second.blocked, true, 'a second paid dispatch with no free work in the window must be blocked');
});

test('a missing ledger file never blocks and never throws', () => {
  const missing = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-work-quota-missing-')), 'none.jsonl');
  assert.deepEqual(quota.readRecords(missing), []);
  const s = quota.snapshot(missing, {});
  assert.equal(s.totalDispatchCount, 0);
  assert.equal(quota.decidePaidDispatch(missing, {}).blocked, false);
});