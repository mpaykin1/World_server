'use strict';

const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');

const {
  buildDataset,
  containsSecretLikeText,
  prepareDataset,
  readJson,
  splitDataset,
  verifyDataset
} = require('../lib/world-brain-factory');

const ROOT = path.resolve(__dirname, '..');
const POLICY = readJson(path.join(ROOT, 'data', 'world-brain-factory-policy.json'));

test('policy is free-first and forbids heavy production/local training by default', () => {
  assert.equal(POLICY.mode, 'free-first');
  assert.equal(POLICY.provider, 'unsloth');
  assert.equal(POLICY.trainingRuntime.productionGpuRequired, false);
  assert.equal(POLICY.trainingRuntime.localHeavyTrainingAllowed, false);
  assert.equal(POLICY.trainingRuntime.paidGpuAllowedByDefault, false);
  assert.equal(POLICY.promotion.automaticRegistryPromotion, false);
});

test('dataset learns protected errors but excludes still-unprotected known issues', () => {
  const result = buildDataset(ROOT, POLICY);
  assert.ok(result.examples.length >= 10, `expected useful verified dataset, got ${result.examples.length}`);
  assert.ok(result.examples.some((entry) => entry.id === 'error:vercel-quota-exhausted-by-non-runtime-deploys'));
  assert.ok(!result.examples.some((entry) => entry.id === 'error:controls-inverted-camera-relative'));
  assert.ok(result.examples.some((entry) => entry.id === 'golden:controls'));
});

test('dataset construction is deterministic apart from the write-time manifest timestamp', () => {
  const first = buildDataset(ROOT, POLICY);
  const second = buildDataset(ROOT, POLICY);
  assert.deepEqual(first.examples, second.examples);
  assert.deepEqual(first.train.map((item) => item.id), second.train.map((item) => item.id));
  assert.deepEqual(first.validation.map((item) => item.id), second.validation.map((item) => item.id));
});

test('deterministic split always keeps both sets when more than one example exists', () => {
  const examples = Array.from({ length: 12 }, (_, index) => ({ id: `x-${index}` }));
  const split = splitDataset(examples, 15);
  assert.ok(split.train.length > 0);
  assert.ok(split.validation.length > 0);
  assert.equal(split.train.length + split.validation.length, examples.length);
});

test('secret-like values are rejected by the guard', () => {
  assert.equal(containsSecretLikeText('password=supersecret123'), true);
  assert.equal(containsSecretLikeText('Authorization: Bearer abcdefghijklmnopqrstuvwxyz'), true);
  assert.equal(containsSecretLikeText('ordinary Golden Standard rule'), false);
});

test('prepare + verify round-trip pins file hashes and finds no secret-like payload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-brain-test-'));
  try {
    const prepared = prepareDataset(ROOT, dir, POLICY);
    assert.ok(prepared.stats.train > 0);
    assert.ok(prepared.stats.validation > 0);
    const verified = verifyDataset(dir);
    assert.equal(verified.ok, true);
    assert.ok(verified.findings.every((finding) => finding.secretFinding === false));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tampering with a prepared dataset fails verification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-brain-test-'));
  try {
    prepareDataset(ROOT, dir, POLICY);
    fs.appendFileSync(path.join(dir, 'train.jsonl'), '{"tampered":true}\n');
    assert.equal(verifyDataset(dir).ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('trainer is external-GPU-only and cannot silently promote itself', () => {
  const trainer = fs.readFileSync(path.join(ROOT, 'scripts', 'train-world-brain-unsloth.py'), 'utf8');
  assert.match(trainer, /torch\.cuda\.is_available\(\)/);
  assert.match(trainer, /productionPromoted["']?\s*:\s*False/);
  assert.match(trainer, /FastLanguageModel/);
  assert.match(trainer, /processing_class=tokenizer/);
  assert.match(trainer, /max_length=args\.max_seq_length/);
});

test('Colab notebook is valid JSON and uses the canonical dataset/trainer pipeline', () => {
  const notebook = JSON.parse(fs.readFileSync(path.join(ROOT, 'notebooks', 'world-brain-unsloth.ipynb'), 'utf8'));
  assert.equal(notebook.nbformat, 4);
  const source = notebook.cells.flatMap((cell) => cell.source || []).join('\n');
  assert.match(source, /world-brain-factory\.cjs/);
  assert.match(source, /train-world-brain-unsloth\.py/);
  assert.match(source, /mpaykin1\/World_server/);
});
