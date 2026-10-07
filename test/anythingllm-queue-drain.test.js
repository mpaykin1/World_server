'use strict';
// Isolated queue DB set before any require() of ai-resource-scheduler.js, which
// reads WORLD_SERVER_QUEUE_DB at module-load time - same pattern as
// test/ai-resource-scheduler-queue.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');

process.env.WORLD_SERVER_QUEUE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drain-watch-test-')), 'jobs.sqlite');

const { watchLoop, isTransientDispatchFailure } = require('../scripts/anythingllm-queue-drain.cjs');

test('watchLoop stops early when stopWhenEmpty is set and the queue has nothing to drain', async () => {
  const ticks = [];
  await watchLoop('test-watcher', 10, { maxTicks: 10, stopWhenEmpty: true, onTick: (r, tick) => ticks.push(r) });
  // An empty queue should stop on the very first tick, not run all 10.
  assert.equal(ticks.length, 1);
  assert.equal(ticks[0].reason, 'queue empty');
});

test('watchLoop respects maxTicks even without stopWhenEmpty', async () => {
  const ticks = [];
  await watchLoop('test-watcher', 5, { maxTicks: 3, onTick: (r) => ticks.push(r) });
  assert.equal(ticks.length, 3);
});

// Real production incident, 2026-09-02, job 3877989c...f2acdaa: the resource
// gate deferred this job across several ticks while real CPU (other live
// AI-agent processes + Godot, same machine) sat at 88-100%, then let it
// dispatch once CPU briefly dipped under threshold. CPU climbed back up during
// the 10-minute dispatch and AnythingLLM never returned a response - the
// AbortSignal.timeout(600000) firing surfaced as `TypeError: fetch failed`
// (message exactly "fetch failed", not "TimeoutError"), which the pre-fix
// drainOne() ack'd as a terminal FAIL, permanently losing a job that was never
// actually answered by a single connection hiccup under known contention -
// exactly the kind of transient condition lib/ai-resource-scheduler.js's
// maxAttempts=50 retry budget exists to survive, but only reaches jobs that
// get requeued instead of ack'd.
test('a network-level failure after the full timeout window (the exact live shape: reason "error_fetch failed", timedOut:false) is treated as transient, not terminal', () => {
  assert.equal(isTransientDispatchFailure({
    result: 'FAIL',
    attempts: [{ attemptNum: 1, ok: false, reason: 'error_fetch failed', timedOut: false, durationMs: 600000 }],
  }), true);
});

test('a genuine client-side TIMEOUT result is treated as transient', () => {
  assert.equal(isTransientDispatchFailure({
    result: 'TIMEOUT',
    attempts: [{ attemptNum: 1, ok: false, reason: 'timeout', timedOut: true, durationMs: 600000 }],
  }), true);
});

test('a 5xx HTTP response is treated as transient (server-side, likely temporary)', () => {
  assert.equal(isTransientDispatchFailure({
    result: 'FAIL',
    attempts: [{ attemptNum: 1, ok: false, reason: 'http_503', durationMs: 1200 }],
  }), true);
});

test('a 4xx HTTP response is NOT treated as transient (a client/config error - retrying will not help)', () => {
  assert.equal(isTransientDispatchFailure({
    result: 'FAIL',
    attempts: [{ attemptNum: 1, ok: false, reason: 'http_400', durationMs: 400 }],
  }), false);
});

test('a genuine completed answer with a real semantic tool-selection mismatch is NOT treated as transient - retrying the identical request would just reproduce the same wrong answer', () => {
  assert.equal(isTransientDispatchFailure({
    result: 'FAIL',
    attempts: [{ attemptNum: 1, ok: true, textResponse: 'cannot be performed', mismatchDetected: true, durationMs: 5000 }],
  }), false);
});

test('a PASS result is never treated as transient', () => {
  assert.equal(isTransientDispatchFailure({
    result: 'PASS',
    attempts: [{ attemptNum: 1, ok: true, textResponse: 'the name is x', mismatchDetected: false, durationMs: 5000 }],
  }), false);
});

test('a null/undefined result is never treated as transient', () => {
  assert.equal(isTransientDispatchFailure(null), false);
  assert.equal(isTransientDispatchFailure(undefined), false);
});
