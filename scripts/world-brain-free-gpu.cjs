#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  buildGpuPlan,
  prepareKaggleBundle,
  submitKaggleBundle
} = require('../lib/world-brain-free-gpu');

const root = path.resolve(__dirname, '..');

function argValue(name, fallback = null) {
  const prefixed = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefixed));
  if (found) return found.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) return process.argv[index + 1];
  return fallback;
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function plan() {
  const result = buildGpuPlan(root);
  emit(result);
  return result;
}

function prepareKaggle() {
  const outDir = path.resolve(root, argValue('out', path.join('work', 'world-brain-kaggle')));
  const owner = argValue('owner', process.env.KAGGLE_USERNAME || null);
  const slug = argValue('slug', 'world-brain-unsloth');
  const result = prepareKaggleBundle(root, outDir, { owner, slug });
  emit({
    ok: true,
    outDir: result.outDir,
    kernelId: result.metadata.id,
    accelerator: result.metadata.machine_shape,
    ownerRequired: result.manifest.ownerRequired,
    counts: result.manifest.counts,
    privateKernel: result.manifest.privateKernel,
    containsCredentialMaterial: result.manifest.containsCredentialMaterial
  });
  return result;
}

function submitKaggle() {
  const dir = path.resolve(root, argValue('dir', argValue('out', path.join('work', 'world-brain-kaggle'))));
  const result = submitKaggleBundle(dir);
  emit(result);
  if (!result.ok) process.exitCode = 2;
  return result;
}

const command = process.argv[2] || 'plan';
if (command === 'plan') plan();
else if (command === 'prepare-kaggle') prepareKaggle();
else if (command === 'submit-kaggle') submitKaggle();
else {
  process.stderr.write('Usage: node scripts/world-brain-free-gpu.cjs <plan|prepare-kaggle|submit-kaggle> [--owner USER --slug SLUG --out DIR|--dir DIR]\n');
  process.exitCode = 2;
}
