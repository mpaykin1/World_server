'use strict';
// Isolated queue DB set before any require() of ai-resource-scheduler.js, which
// reads WORLD_SERVER_QUEUE_DB at module-load time - same pattern as
// test/ai-resource-scheduler-queue.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');

process.env.WORLD_SERVER_QUEUE_DB = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'drain-watch-test-')), 'jobs.sqlite');

const { watchLoop } = require('../scripts/anythingllm-queue-drain.cjs');

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
