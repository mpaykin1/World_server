'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { recordOutcome, isSuitable, pickBackend } = require('../lib/model-suitability');

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
