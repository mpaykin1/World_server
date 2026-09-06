'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');

test('cloud-first policy is durable and handoff exists', () => {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /CLOUD-FIRST \/ LOW-IMPACT AI EXECUTION/);
  assert.match(agents, /Browser\/cloud first/);
  assert.match(agents, /Computer health is part of correctness/);
  assert.ok(fs.existsSync(path.join(root, 'CLOUD_AI_HANDOFF.md')));
});

test('cloud-first policy forbids Desktop AI clutter', () => {
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /Do not create AI worktrees, clones, archives, logs, caches/);
  assert.match(agents, /root-cause fix plus regression protection/);
});
