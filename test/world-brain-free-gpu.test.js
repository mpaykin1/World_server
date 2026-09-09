'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');
const {
  buildGpuPlan,
  normalizeOwner,
  prepareKaggleBundle,
  submitKaggleBundle
} = require('../lib/world-brain-free-gpu');

const ROOT = path.resolve(__dirname, '..');

test('free GPU policy prefers Kaggle T4 and never blocks the server when unavailable', () => {
  const plan = buildGpuPlan(ROOT, {
    kaggleAuth: { configured: false, sources: [] },
    kaggleCliAvailable: false
  });
  assert.equal(plan.state, 'READY_FOR_GPU');
  assert.equal(plan.selected, 'google-colab-free-gpu');
  assert.equal(plan.serverBlocked, false);
  assert.equal(plan.localHeavyTrainingAllowed, false);
  const kaggle = plan.providers.find((provider) => provider.id === 'kaggle-free-gpu-t4');
  assert.equal(kaggle.accelerator, 'NvidiaTeslaT4');
  assert.equal(kaggle.status, 'NEEDS_AUTH');
});

test('Kaggle becomes the selected backend only when auth and CLI are both ready', () => {
  const plan = buildGpuPlan(ROOT, {
    kaggleAuth: { configured: true, sources: ['test-only'] },
    kaggleCliAvailable: true
  });
  assert.equal(plan.state, 'READY_TO_SUBMIT');
  assert.equal(plan.selected, 'kaggle-free-gpu-t4');
  assert.equal(plan.providers[0].status, 'READY_TO_SUBMIT');
});

test('Kaggle owner validation refuses path/shell injection shapes', () => {
  assert.equal(normalizeOwner('safe_user-1'), 'safe_user-1');
  assert.equal(normalizeOwner('../escape'), null);
  assert.equal(normalizeOwner('name;rm -rf'), null);
  assert.equal(normalizeOwner(''), null);
});

test('prepareKaggleBundle creates a private self-contained T4 kernel and removes plaintext temp dataset', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-brain-kaggle-'));
  try {
    const result = prepareKaggleBundle(ROOT, dir, { owner: 'safe_user', slug: 'world-brain-unsloth' });
    assert.equal(result.metadata.id, 'safe_user/world-brain-unsloth');
    assert.equal(result.metadata.is_private, true);
    assert.equal(result.metadata.enable_gpu, true);
    assert.equal(result.metadata.enable_internet, true);
    assert.equal(result.metadata.machine_shape, 'NvidiaTeslaT4');
    assert.equal(result.manifest.containsCredentialMaterial, false);
    assert.equal(result.manifest.privateKernel, true);
    assert.equal(result.manifest.ownerRequired, false);
    assert.ok(result.manifest.counts.train > 0);
    assert.ok(result.manifest.counts.validation > 0);
    assert.equal(fs.existsSync(path.join(dir, '.dataset-tmp')), false);
    const script = fs.readFileSync(path.join(dir, 'world-brain-kaggle.py'), 'utf8');
    assert.match(script, /DATA_B64 =/);
    assert.match(script, /TRAINER_B64 =/);
    assert.match(script, /torch\.cuda\.is_available/);
    assert.doesNotMatch(script, /KAGGLE_API_TOKEN/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('generated Kaggle script is valid Python syntax', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-brain-kaggle-py-'));
  try {
    prepareKaggleBundle(ROOT, dir, { owner: 'safe_user' });
    const script = path.join(dir, 'world-brain-kaggle.py');
    const result = spawnSync('python', ['-m', 'py_compile', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('submission fails closed before invoking Kaggle when owner is still missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-brain-kaggle-owner-'));
  try {
    prepareKaggleBundle(ROOT, dir, {});
    const result = submitKaggleBundle(dir, { kaggleCliAvailable: true });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'NEEDS_OWNER');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('submission reports missing CLI without installing anything on the PC', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'world-brain-kaggle-cli-'));
  try {
    prepareKaggleBundle(ROOT, dir, { owner: 'safe_user' });
    const result = submitKaggleBundle(dir, { kaggleCliAvailable: false });
    assert.equal(result.ok, false);
    assert.equal(result.status, 'NEEDS_CLI');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('GitHub free-GPU workflow is manual-only, private-data aware and selects T4', () => {
  const workflow = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'world-brain-free-gpu.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /KAGGLE_API_TOKEN/);
  assert.match(workflow, /KAGGLE_USERNAME/);
  assert.match(workflow, /NvidiaTeslaT4/);
  assert.match(workflow, /world-brain:kaggle:prepare/);
});
