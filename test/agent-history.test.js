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

// --- shouldSkipModelForTaskClass: point 8 this cycle - don't retry a
// model that has reliably failed a specific task class first. ---

test('shouldSkipModelForTaskClass: does not skip with too little history to conclude anything', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.shouldSkipModelForTaskClass(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, false);
});

test('shouldSkipModelForTaskClass: skips once a model has real evidence of reliable failure on this exact task class', () => {
  const root = tmpRoot();
  for (let i = 0; i < 3; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.shouldSkipModelForTaskClass(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, true);
  assert.equal(r.attempts, 3);
});

test('shouldSkipModelForTaskClass: does not skip a model with any real success in its history, even with several failures too', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: true });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.shouldSkipModelForTaskClass(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, false);
});

test('shouldSkipModelForTaskClass: never bleeds across a different task type', () => {
  const root = tmpRoot();
  for (let i = 0; i < 3; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.shouldSkipModelForTaskClass(root, { model: 'model-a', taskType: 'config-change' });
  assert.equal(r.skip, false);
});

// --- scoreModelForTask: point 9 this cycle - route on P(success) x
// quality / latency / resource cost / money, not raw cost alone. ---

test('scoreModelForTask: a model that reliably succeeds fast scores higher than one that reliably fails slowly', () => {
  const root = tmpRoot();
  for (let i = 0; i < 3; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'fast-good', durationMs: 20000, success: true });
  for (let i = 0; i < 3; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'slow-bad', durationMs: 240000, success: false });
  const good = history.scoreModelForTask(root, { model: 'fast-good', taskType: 'markup-fix', provider: 'opencode-free' });
  const bad = history.scoreModelForTask(root, { model: 'slow-bad', taskType: 'markup-fix', provider: 'opencode-free' });
  assert.ok(good.score > bad.score, `expected fast-good score (${good.score}) > slow-bad score (${bad.score})`);
});

test('scoreModelForTask: real evidence beats raw $0-cost equality — a $0 model that almost always fails does not automatically win', () => {
  const root = tmpRoot();
  for (let i = 0; i < 4; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'unreliable-free', durationMs: 200000, success: i === 0 });
  for (let i = 0; i < 4; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'reliable-free', durationMs: 20000, success: true });
  const unreliable = history.scoreModelForTask(root, { model: 'unreliable-free', taskType: 'markup-fix', provider: 'opencode-free', costUsd: 0 });
  const reliable = history.scoreModelForTask(root, { model: 'reliable-free', taskType: 'markup-fix', provider: 'opencode-free', costUsd: 0 });
  assert.equal(unreliable.moneyWeight, reliable.moneyWeight, 'both are real $0 - cost alone must not be what decides this');
  assert.ok(reliable.score > unreliable.score);
});

test('scoreModelForTask: an untested model gets a neutral prior, neither favored nor excluded', () => {
  const root = tmpRoot();
  const r = history.scoreModelForTask(root, { model: 'never-seen', taskType: 'markup-fix', provider: 'opencode-free' });
  assert.equal(r.pSuccess, 0.5);
  assert.equal(r.sampleSize, 0);
});

test('scoreModelForTask: a local model carries a real resource-cost weight a remote model of equal reliability/latency does not', () => {
  const root = tmpRoot();
  for (let i = 0; i < 3; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'local-model', durationMs: 30000, success: true });
  for (let i = 0; i < 3; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'remote-model', durationMs: 30000, success: true });
  const local = history.scoreModelForTask(root, { model: 'local-model', taskType: 'markup-fix', provider: 'ollama-local' });
  const remote = history.scoreModelForTask(root, { model: 'remote-model', taskType: 'markup-fix', provider: 'opencode-free' });
  assert.equal(local.pSuccess, remote.pSuccess);
  assert.equal(local.avgLatencyMs, remote.avgLatencyMs);
  assert.ok(local.resourceWeight > remote.resourceWeight, 'local CPU-bound inference must carry a real, higher resource-cost weight than a remote call with identical success/latency');
  assert.ok(local.score < remote.score);
});

// --- isModelInformative + routing exclusion: point 7 (new cycle) - the
// failure taxonomy must influence routing, not just get recorded. A
// pipeline/resource-layer failure is not evidence the MODEL is bad. ---

test('isModelInformative: a pipeline-layer failure is not informative about the model', () => {
  assert.equal(history.isModelInformative({ success: false, failureLayer: 'pipeline' }), false);
});

test('isModelInformative: a resource-layer failure (e.g. a real RAM-pressure health skip) is not informative about the model', () => {
  assert.equal(history.isModelInformative({ success: false, failureLayer: 'resource' }), false);
});

test('isModelInformative: a model-layer failure IS informative - real evidence the model itself struggled', () => {
  assert.equal(history.isModelInformative({ success: false, failureLayer: 'model' }), true);
});

test('isModelInformative: any real success is always informative regardless of layer field', () => {
  assert.equal(history.isModelInformative({ success: true }), true);
});

test('isModelInformative: a legacy entry with no failureLayer field at all is kept (never silently discards pre-cycle history)', () => {
  assert.equal(history.isModelInformative({ success: false }), true);
});

test('rankModelsForTask: a pipeline-layer failure (e.g. a context-compiler misroute) is never counted as a real attempt against the model - the model never even got a fair try', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false, failureLayer: 'pipeline' });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false, failureLayer: 'pipeline' });
  const r = history.rankModelsForTask(root, { goal: 'fix viewport meta tag', contextFileCount: 3 }, ['model-a', 'model-b']);
  assert.equal(r.detail.find((d) => d.model === 'model-a').attempts, 0, 'pipeline-layer failures must not count as real attempts against the model');
  assert.equal(r.detail.find((d) => d.model === 'model-a').successRate, null, 'with zero informative attempts the model must read as untested, not as a real failure');
});

test('shouldSkipModelForTaskClass: never prunes a model purely on pipeline-layer failures, no matter how many', () => {
  const root = tmpRoot();
  for (let i = 0; i < 5; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false, failureLayer: 'pipeline' });
  const r = history.shouldSkipModelForTaskClass(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, false, '5 pipeline-layer failures are zero real evidence against the model itself');
});

test('evidenceWeightedSkip: never skips a model from resource-layer failures (e.g. repeated real RAM-pressure blocks) alone', () => {
  const root = tmpRoot();
  for (let i = 0; i < 4; i++) history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false, failureLayer: 'resource' });
  const r = history.evidenceWeightedSkip(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, false);
});

// --- evidenceWeightedSkip: point 6 this cycle - confidence-weighted,
// recency-decayed evidence reacts faster than the flat >=3-attempts rule
// when the signal is strong, but never bans a model from one lone failure.

test('evidenceWeightedSkip: never skips from a single failure - not enough weighted evidence to conclude anything', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.evidenceWeightedSkip(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, false);
});

test('evidenceWeightedSkip: skips FASTER than the flat rule when 2 strong, recent, back-to-back failures give decisive evidence', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.evidenceWeightedSkip(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, true, '2 recent, unanimous real failures must be enough decayed evidence to skip - the old flat rule needed a 3rd wasted attempt for this');
});

test('evidenceWeightedSkip: a recent real success recovers a model\'s standing even after older failures', () => {
  const root = tmpRoot();
  const old = new Date(Date.now() - 40 * 86400000).toISOString(); // 40 days ago, well past the 14-day half-life
  const fp = require('fs');
  const p = history.historyPath(root);
  fp.mkdirSync(require('path').dirname(p), { recursive: true });
  fp.appendFileSync(p, JSON.stringify({ at: old, taskType: 'markup-fix', model: 'model-a', success: false }) + '\n');
  fp.appendFileSync(p, JSON.stringify({ at: old, taskType: 'markup-fix', model: 'model-a', success: false }) + '\n');
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: true });
  const r = history.evidenceWeightedSkip(root, { model: 'model-a', taskType: 'markup-fix' });
  assert.equal(r.skip, false, 'a recent real success plus decayed old failures must not still read as reliable failure');
});

test('evidenceWeightedSkip: never bleeds across a different task type', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  history.recordAttempt(root, { taskType: 'markup-fix', contextBucket: 'small', model: 'model-a', durationMs: 1000, success: false });
  const r = history.evidenceWeightedSkip(root, { model: 'model-a', taskType: 'config-change' });
  assert.equal(r.skip, false);
});

test('recordAttempt + readHistory: real round-trip, survives a fresh module require', () => {
  const root = tmpRoot();
  history.recordAttempt(root, { taskType: 'general', contextBucket: 'small', model: 'x', durationMs: 1, success: true });
  const entries = history.readHistory(root);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].model, 'x');
  assert.ok(entries[0].at, 'each entry must be timestamped');
});
