'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { recordOutcome, isSuitable, pickBackend, pickBestBackend, scoreBackend } = require('../lib/model-suitability');

function tmpLedger() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'suitability-')), 'ledger.json'); }

test('a model with too few samples defaults to suitable', () => {
  const ledgerPath = tmpLedger();
  const v = isSuitable('qwen3:1.7b', 'filesystem-read', { ledgerPath });
  assert.equal(v.suitable, true);
  assert.equal(v.samples, 0);
});

test('two fails and one pass out of three keeps it below the judging threshold sample-wise but crosses fail-rate once judged', () => {
  const ledgerPath = tmpLedger();
  recordOutcome('qwen3:1.7b', 'filesystem-read', 'FAIL', { ledgerPath });
  recordOutcome('qwen3:1.7b', 'filesystem-read', 'FAIL', { ledgerPath });
  const v = recordOutcome('qwen3:1.7b', 'filesystem-read', 'PASS', { ledgerPath });
  assert.equal(v.samples, 3);
  assert.equal(v.suitable, false);
});

test('a consistent pass streak stays suitable', () => {
  const ledgerPath = tmpLedger();
  recordOutcome('qwen3:1.7b', 'filesystem-read', 'PASS', { ledgerPath });
  recordOutcome('qwen3:1.7b', 'filesystem-read', 'PASS', { ledgerPath });
  const v = recordOutcome('qwen3:1.7b', 'filesystem-read', 'PASS', { ledgerPath });
  assert.equal(v.suitable, true);
});

test('pickBackend recommends escalation once a model is marked unsuitable, if a candidate exists', () => {
  const ledgerPath = tmpLedger();
  for (let i = 0; i < 3; i++) recordOutcome('qwen3:1.7b', 'filesystem-write', 'FAIL', { ledgerPath });
  const r = pickBackend('qwen3:1.7b', 'filesystem-write', ['qwen3:1.7b', 'openhuman-openrouter-free'], { ledgerPath });
  assert.equal(r.escalated, true);
  assert.equal(r.backend, 'openhuman-openrouter-free');
});

test('pickBackend is honest when no fallback candidate is actually wired up', () => {
  const ledgerPath = tmpLedger();
  for (let i = 0; i < 3; i++) recordOutcome('qwen3:1.7b', 'filesystem-write', 'FAIL', { ledgerPath });
  const r = pickBackend('qwen3:1.7b', 'filesystem-write', ['qwen3:1.7b'], { ledgerPath });
  assert.equal(r.escalated, false);
  assert.equal(r.backend, 'qwen3:1.7b');
  assert.match(r.note, /no alternative backend is currently wired/);
});

test('different capability classes are tracked independently for the same model', () => {
  const ledgerPath = tmpLedger();
  for (let i = 0; i < 3; i++) recordOutcome('qwen3:1.7b', 'filesystem-read', 'FAIL', { ledgerPath });
  const readVerdict = isSuitable('qwen3:1.7b', 'filesystem-read', { ledgerPath });
  const writeVerdict = isSuitable('qwen3:1.7b', 'filesystem-write', { ledgerPath });
  assert.equal(readVerdict.suitable, false);
  assert.equal(writeVerdict.suitable, true);
});

test('recordOutcome accepts and stores latency/tokens metrics without breaking outcome-only callers', () => {
  const ledgerPath = tmpLedger();
  recordOutcome('qwen2.5:3b-instruct', 'filesystem-read', 'PASS', { ledgerPath, latencyMs: 12000, tokens: 400 });
  const score = scoreBackend('qwen2.5:3b-instruct', 'filesystem-read', { ledgerPath });
  assert.equal(score.samples, 1);
  assert.equal(score.avgLatencyMs, 12000);
  assert.equal(score.avgTokens, 400);
});

test('scoreBackend reports 0 samples honestly for a never-tried model, not a fabricated score', () => {
  const ledgerPath = tmpLedger();
  const score = scoreBackend('never-tried-model', 'filesystem-read', { ledgerPath });
  assert.equal(score.samples, 0);
  assert.equal(score.successRate, null);
});

test('pickBestBackend explores an untried candidate before trusting a partially-explored mediocre one', () => {
  const ledgerPath = tmpLedger();
  recordOutcome('model-a', 'filesystem-read', 'FAIL', { ledgerPath });
  const r = pickBestBackend('filesystem-read', ['model-a', 'model-b'], { ledgerPath });
  assert.equal(r.backend, 'model-b');
  assert.match(r.reason, /exploring/);
});

test('pickBestBackend ranks explored candidates by success rate, then latency as tiebreak', () => {
  const ledgerPath = tmpLedger();
  recordOutcome('slow-reliable', 'filesystem-read', 'PASS', { ledgerPath, latencyMs: 90000 });
  recordOutcome('fast-reliable', 'filesystem-read', 'PASS', { ledgerPath, latencyMs: 10000 });
  recordOutcome('unreliable', 'filesystem-read', 'FAIL', { ledgerPath, latencyMs: 1000 });
  const r = pickBestBackend('filesystem-read', ['slow-reliable', 'fast-reliable', 'unreliable'], { ledgerPath });
  assert.equal(r.backend, 'fast-reliable');
});

test('pickBestBackend with no explicit candidate list falls back to data/model-registry.json declarations', () => {
  const r = pickBestBackend('filesystem-write');
  assert.ok(r.backend, JSON.stringify(r));
  assert.ok(r.scores.length > 0);
});

test('pickBestBackend is honest when no candidates are declared for a class', () => {
  const r = pickBestBackend('nonexistent-class-xyz');
  assert.equal(r.backend, null);
  assert.match(r.reason, /no candidates declared/);
});
