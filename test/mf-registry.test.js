'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

test('MF root discovery file and machine registry stay synchronized', () => {
  const md = fs.readFileSync(path.join(root, 'MF.md'), 'utf8');
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'must-finish-projects.json'), 'utf8'));
  assert.equal(registry.name, 'MF');
  assert.equal(registry.title, 'Must Finish');
  assert.ok(Array.isArray(registry.projects) && registry.projects.length >= 1);
  const seeds = registry.projects.find(project => project.id === 'MF-001');
  assert.ok(seeds);
  assert.equal(seeds.mustFinish, true);
  assert.equal(seeds.userVerdict, 'USER_VERDICT_PENDING');
  assert.equal(seeds.pullRequest, 414);
  assert.equal(seeds.branch, 'ai/chatgpt/architecture-seeds');
  assert.match(md, /MF-001/);
  assert.match(md, /Seed System \/ Architecture Seeds × Minecraft/);
  assert.match(md, /USER_VERDICT_PENDING/);
});

test('MF is a project registry, not another automation', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'must-finish-projects.json'), 'utf8'));
  assert.equal(registry.policy.createsNewAutomation, false);
  assert.equal(registry.policy.addOnlyOnExplicitUserRequest, true);
  assert.equal(registry.policy.removeOnlyOnExplicitUserCompletionVerdict, true);
});


test('fresh-chat bootstrap points to MF directly', () => {
  const ai = fs.readFileSync(path.join(root, 'AI_START_HERE.md'), 'utf8');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.match(ai, /MF\.md/);
  assert.match(ai, /data\/must-finish-projects\.json/);
  assert.match(ai, /issue #80/);
  assert.match(agents, /MF \/ Must Finish/);
  assert.match(agents, /data\/must-finish-projects\.json/);
  assert.match(agents, /не отдельная AKA\/automation задача/);
});
