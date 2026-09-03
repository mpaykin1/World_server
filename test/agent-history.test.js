'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const history = require('../lib/agent-history');

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-history-test-'));
  return dir;
}

test('classifyTaskType: keyword buckets are real and stable, unknown text falls back to general', () => {
  assert.equal(history.classifyTaskType('add viewport-fit=cover to the meta viewport tag'), 'markup-fix');
  assert.equal(history.classifyTaskType('fix the failing test assertion'), 'test-fix');
  assert.equal(history.classifyTaskType('update package.json dependency'), 'config-change');
  assert.equal(history.classifyTaskType('completely unrelated gibberish zzqx'), 'general');
});

test('contextSizeBucket: buckets small/medium/large/full correctly', () => {
  assert.equal(history.contextSizeBucket(3), 'small');
  assert.equal(history.contextSizeBucket(15), 'medium');
  assert.equal(history.contextSizeBucket(50), 'large');
  assert.equal(history.contextSizeBucket('full-repo'), 'full');
  assert.equal(history.contextSizeBucket(null), 'full');
});

test('rankModelsForTask: with no history, returns the original order unchanged (no false confidence)', () => {
  const root = tmpRoot();
  const r = history.rankModelsForTask(root, { goal: 'fix viewport meta tag', contextFileCount: 3 }, ['model-a', 'model-b', 'model-c']);
  assert.deepEqual(r.order, ['model-a', 'model-b', 'model-c']);
});

test('rankModelsForTask: a model with a real, better track record on similar tasks ranks first', () => {
  const root = tmpRoot();
  // model-b: 3/3 successes on markup-fix/small; model-a: 1/3 successes on the same bucket
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 5000, success: true });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 5000, success: false });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 5000, success: false });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-b', durationMs: 3000, success: true });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-b', durationMs: 3000, success: true });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-b', durationMs: 3000, success: true });

  const r = history.rankModelsForTask(root, { goal: 'fix viewport meta tag', contextFileCount: 3 }, ['model-a', 'model-b']);
  assert.equal(r.order[0], 'model-b', 'model-b has a real 100% success rate on this exact task type/bucket and must rank first');
});

test('rankModelsForTask: history for a DIFFERENT task type/bucket does not bleed into this ranking', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'test-fix', contextBucket: 'large', model: 'model-a', durationMs: 1000, success: false });
  history.recordAttempt(root, { taskType: 'test-fix', contextBucket: 'large', model: 'model-a', durationMs: 1000, success: false });
  // unrelated bucket/type - must not affect a markup-fix/small ranking
  const r = history.rankModelsForTask(root, { goal: 'fix viewport meta tag', contextFileCount: 3 }, ['model-a', 'model-b']);
  assert.deepEqual(r.order, ['model-a', 'model-b']);
});

test('recommendTimeoutMs: falls back to the given default with insufficient history', () => {
  const root = tmpRoot();
  const t = history.recommendTimeoutMs(root, { goal: 'fix viewport meta tag', contextFileCount: 3 }, 90000);
  assert.equal(t, 90000);
});

test('recommendTimeoutMs: with real successful-attempt history, scales from actual observed durations', () => {
  const root = tmpRoot();
  for (const d of [10000, 12000, 11000, 40000]) {
    history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: d, success: true });
  }
  const t = history.recommendTimeoutMs(root, { goal: 'fix viewport meta tag', contextFileCount: 3 }, 90000);
  assert.notEqual(t, 90000, 'with 4 real successful samples, must use the observed p90 * margin, not the arbitrary fallback');
  assert.ok(t >= 20000);
});

test('recordAttempt + readHistory: real round-trip, survives a fresh module require', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'general', contextBucket: 'small', model: 'x', durationMs: 1, success: true });
  const entries = history.readHistory(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].model, 'x');
  assert.ok(entries[0].at, 'each entry must be timestamped');
});
