'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { makeHandoff, formatHandoff } = require('../scripts/qwen-handoff.cjs');
const SHA = 'a'.repeat(40);

test('handoff carries exact baseline, real model label and canonical context', () => {
  const result = makeHandoff({ task: 'Implement deterministic fog', sha: SHA, branch: 'world-ai/123', model: 'qwen/qwen3-coder:free' });
  assert.equal(result.baseSha, SHA);
  assert.equal(result.actualModel, 'qwen/qwen3-coder:free');
  assert.ok(result.contextFiles.includes('AI_START_HERE.md'));
  assert.ok(result.contextFiles.includes('QWEN.md'));
  assert.match(formatHandoff(result), /RETURN: WORLD_AI_RESULT_V1/);
});

test('unresolved model is never presented as a confirmed Qwen run', () => {
  const result = makeHandoff({ task: 'Review WebGL', sha: SHA, branch: 'feat/a' });
  assert.equal(result.actualModel, 'resolve-at-runtime');
  assert.equal(result.requestedAgent, 'Qwen preferred');
});

test('malformed input fails closed before starting an agent', () => {
  for (const task of ['', ' '.repeat(3), 'A'.repeat(6001), 'a\0b']) {
    assert.throws(() => makeHandoff({ task, sha: SHA, branch: 'feat/a' }), /Task must/);
  }
  assert.throws(() => makeHandoff({ task: 'ok', sha: 'master', branch: 'feat/a' }), /Invalid base/);
  assert.throws(() => makeHandoff({ task: 'ok', sha: SHA, branch: 'feat/a\nINJECTED' }), /Invalid branch/);
});

test('free-form task is transmitted literally and never shell-interpreted', () => {
  const task = 'People shoot the dragon; $(echo DANGER)';
  const handoff = formatHandoff(makeHandoff({ task, sha: SHA, branch: 'ai/qwen/dragon' }));
  assert.ok(handoff.includes(task));
});
