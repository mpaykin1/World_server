'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('engagement policy has hard evidence and reliability guardrails', () => {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'improve-world-home', 'public', 'engagement-policy.json'), 'utf8'));
  assert.ok(p.minimumEvidence.sessionsPerVariant >= 20);
  assert.ok(p.guardrails.mobileFpsP10 >= 30);
  assert.ok(p.guardrails.maxErrorRate <= .05);
  assert.ok(Array.isArray(p.variants.navigatorTone) && p.variants.navigatorTone.length >= 2);
});

test('learner cannot mutate questionnaire text and requires explicit --apply', () => {
  const s = fs.readFileSync(path.join(root, 'scripts', 'engagement-learning-loop.js'), 'utf8');
  assert.match(s, /process\.argv\.includes\('--apply'\)/);
  assert.match(s, /automaticQuestionMutation:false/);
  assert.match(s, /minimumEvidence/);
  assert.match(s, /guardrails/);
});
