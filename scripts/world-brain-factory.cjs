#!/usr/bin/env node
'use strict';

const path = require('path');
const {
  buildDataset,
  prepareDataset,
  readJson,
  verifyDataset
} = require('../lib/world-brain-factory');

const root = path.resolve(__dirname, '..');

function argValue(name, fallback = null) {
  const prefixed = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefixed));
  if (found) return found.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) return process.argv[index + 1];
  return fallback;
}

function policy() {
  return readJson(path.join(root, 'data', 'world-brain-factory-policy.json'));
}

function status() {
  const result = buildDataset(root, policy());
  const summary = {
    system: 'WORLD_BRAIN_FACTORY',
    provider: result.policy.provider,
    mode: result.policy.mode,
    defaultModel: result.policy.training.defaultModel,
    preferredTrainingRuntime: result.policy.trainingRuntime.preferred,
    localHeavyTrainingAllowed: result.policy.trainingRuntime.localHeavyTrainingAllowed,
    productionGpuRequired: result.policy.trainingRuntime.productionGpuRequired,
    examples: result.stats
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function prepare() {
  const out = path.resolve(root, argValue('out', path.join('work', 'world-brain')));
  const result = prepareDataset(root, out, policy());
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outDir: result.outDir,
    counts: result.stats,
    policyHash: result.manifest.policyHash,
    sourceCommit: result.manifest.sourceCommit
  }, null, 2)}\n`);
  return result;
}

function verify() {
  const out = path.resolve(root, argValue('dir', argValue('out', path.join('work', 'world-brain'))));
  const result = verifyDataset(out);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const command = process.argv[2] || 'status';
if (command === 'status') status();
else if (command === 'prepare') prepare();
else if (command === 'verify') verify();
else {
  process.stderr.write('Usage: node scripts/world-brain-factory.cjs <status|prepare|verify> [--out DIR|--dir DIR]\n');
  process.exitCode = 2;
}
