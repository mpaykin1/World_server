'use strict';
// Regression tests for the daily AI-agent work-budget guard ("paid fallback
// (Codex) must stay at or below 30 percent of daily AI-agent work; never use
// paid APIs or paid GPU"). The guard must be deterministic, must never crash
// on malformed ledger lines, must ignore non-work queue noise, and must be
// excluded from the ledger window by time. Threshold edges are exact.

const test = require('node:test');
const assert = require('node:assert/strict');
const budget = require('../lib/agent-budget-guard');

const NOW = '2026-09-15T12:00:00.000Z';
const INSIDE = '2026-09-14T20:00:00.000Z';
const OUTSIDE = '2026-09-10T00:00:00.000Z';

function line(at, agent, status, taskId) {
  return JSON.stringify({ at, agent, status, task_id: taskId || `t-${agent}` });
}

test('classifyAgentId marks only codex as paid-fallback and never throws on unknown', () => {
  assert.equal(budget.classifyAgentId('codex'), 'paid-fallback');
  assert.equal(budget.classifyAgentId('opencode'), 'free');
  assert.equal(budget.classifyAgentId('claude-code'), 'free');
  assert.equal(budget.classifyAgentId('openhuman-anythingllm'), 'free');
  assert.equal(budget.classifyAgentId('world-cloud-ai'), 'free');
  assert.equal(budget.classifyAgentId('something-new'), 'unknown');
});

test('empty ledger is NO_WORK with a 0 paid share (never a fabricated PASS)', () => {
  const r = budget.analyzeLedger('', { nowIso: NOW });
  assert.equal(r.verdict, 'NO_WORK');
  assert.equal(r.paidSharePercent, 0);
  assert.equal(r.totalWork, 0);
});

test('paid-fallback share exactly at the 30 percent cap is OK', () => {
  const ledger = [
    line(INSIDE, 'codex', 'done', 'p1'),
    line(INSIDE, 'codex', 'done', 'p2'),
    line(INSIDE, 'codex', 'done', 'p3'),
    line(INSIDE, 'opencode', 'done', 'f1'),
    line(INSIDE, 'opencode', 'done', 'f2'),
    line(INSIDE, 'opencode', 'done', 'f3'),
    line(INSIDE, 'claude-code', 'done', 'f4'),
    line(INSIDE, 'opencode', 'done', 'f5'),
    line(INSIDE, 'opencode', 'done', 'f6'),
    line(INSIDE, 'opencode', 'done', 'f7'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 10);
  assert.equal(r.paidWork, 3);
  assert.equal(r.paidSharePercent, 30);
  assert.equal(r.verdict, 'OK');
  assert.equal(r.paidEntries.length, 3);
});

test('paid-fallback share above 30 percent is BUDGET_EXCEEDED', () => {
  const ledger = [
    line(INSIDE, 'codex', 'done', 'p1'),
    line(INSIDE, 'codex', 'failed', 'p2'),
    line(INSIDE, 'codex', 'done', 'p3'),
    line(INSIDE, 'codex', 'assigned', 'p4'),
    line(INSIDE, 'opencode', 'done', 'f1'),
    line(INSIDE, 'opencode', 'done', 'f2'),
    line(INSIDE, 'opencode', 'done', 'f3'),
    line(INSIDE, 'opencode', 'done', 'f4'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 8);
  assert.equal(r.paidWork, 4);
  assert.equal(r.paidSharePercent, 50);
  assert.equal(r.verdict, 'BUDGET_EXCEEDED');
});

test('work entries are time-boxed to the 24h window (old entries excluded)', () => {
  const ledger = [
    line(INSIDE, 'codex', 'done', 'p-new'),
    line(OUTSIDE, 'codex', 'done', 'p-old'),
    line(OUTSIDE, 'opencode', 'done', 'f-old'),
    line(INSIDE, 'opencode', 'done', 'f-new'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 2);
  assert.equal(r.paidWork, 1);
  assert.equal(r.paidSharePercent, 50);
  assert.equal(r.verdict, 'BUDGET_EXCEEDED');
});

test('queued/skipped entries are not work and cannot hide or inflate the paid share', () => {
  const ledger = [
    line(INSIDE, 'codex', 'done', 'p1'),
    line(INSIDE, 'codex', 'done', 'p2'),
    line(INSIDE, 'openhuman-anythingllm', 'queued', 'q1'),
    line(INSIDE, 'openhuman-anythingllm', 'queued', 'q2'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 2);
  assert.equal(r.paidSharePercent, 100);
  assert.equal(r.verdict, 'BUDGET_EXCEEDED');
});

test('malformed ledger lines are skipped without throwing', () => {
  const ledger = [
    'not json at all {',
    line(INSIDE, 'opencode', 'done', 'f1'),
    '',
    line(INSIDE, 'opencode', 'done', 'f2'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 2);
  assert.equal(r.verdict, 'OK');
});

test('future-dated ledger entries are excluded (clock-skew safety)', () => {
  const ledger = [
    line('2026-09-15T13:00:00.000Z', 'codex', 'done', 'future'),
    line(INSIDE, 'opencode', 'done', 'f1'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 1);
  assert.equal(r.paidWork, 0);
  assert.equal(r.verdict, 'OK');
});

test('unknown agent ids count as work but never as paid fallback', () => {
  const ledger = [
    line(INSIDE, 'brand-new-agent-9000', 'done', 'u1'),
    line(INSIDE, 'codex', 'done', 'p1'),
    line(INSIDE, 'opencode', 'done', 'f1'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.equal(r.totalWork, 3);
  assert.equal(r.unknownWork, 1);
  assert.equal(r.paidSharePercent, 33.3);
  assert.equal(r.verdict, 'BUDGET_EXCEEDED');
});

test('per-agent breakdown reports agent-level share for transparency', () => {
  const ledger = [
    line(INSIDE, 'codex', 'done', 'p1'),
    line(INSIDE, 'opencode', 'done', 'f1'),
    line(INSIDE, 'claude-code', 'done', 'f2'),
  ].join('\n');
  const r = budget.analyzeLedger(ledger, { nowIso: NOW });
  assert.deepEqual(r.perAgent, { codex: 1, opencode: 1, 'claude-code': 1 });
});