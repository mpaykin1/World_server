'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

test('canonical Vercel project blocks feature-branch auto deploys', () => {
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.equal(config.git?.deploymentEnabled?.['**'], false);
  assert.equal(config.git?.deploymentEnabled?.master, true);
  assert.equal(typeof config.ignoreCommand, 'string');
  assert.match(config.ignoreCommand, /check-vercel-ignore/);
});

test('agent policy forbids blind retries after Vercel daily quota exhaustion', () => {
  const rules = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8');
  assert.match(rules, /api-deployments-free-per-day/);
  assert.match(rules, /do not retry deploy\/redeploy in a loop/i);
  assert.match(rules, /one manual preview/i);
});
