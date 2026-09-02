'use strict';
// Separate test file (not merged into ai-resource-scheduler.test.js) because it
// must set WORLD_SERVER_QUEUE_DB to an isolated temp path BEFORE the module's
// lazy require() of durable-job-queue.cjs happens - durable-job-queue.cjs reads
// that env var at its own module-load time, so this needs to run in a fresh
// process (node:test gives each file its own process) rather than share state
// with tests that already triggered the default queue path.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');

const tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'queue-test-')), 'jobs.sqlite');
process.env.WORLD_SERVER_QUEUE_DB = tmpDb;

const { enqueueTask, claimTask, ackTask, failTask } = require('../lib/ai-resource-scheduler');

test('enqueueTask persists a real job that claimTask can pick up', () => {
  const enq = enqueueTask({ taskText: 'read package.json', workspaceSlug: 'world', threadSlug: 'thread-1', timeoutMs: 150000 });
  assert.ok(enq.ok);
  assert.ok(enq.id);
  const claimed = claimTask('test-worker');
  assert.ok(claimed);
  assert.equal(claimed.payload.taskText, 'read package.json');
  assert.equal(claimed.payload.threadSlug, 'thread-1');
  const acked = ackTask(claimed.id, 'test-worker', { result: 'PASS' });
  assert.ok(acked.ok);
});

test('a claimed-but-failed job is requeued for retry, not lost', () => {
  const enq = enqueueTask({ taskText: 'find config.json', workspaceSlug: 'world', threadSlug: 'thread-2', timeoutMs: 150000 });
  const claimed = claimTask('test-worker');
  assert.equal(claimed.id, enq.id);
  const failed = failTask(claimed.id, 'test-worker', 'still contended', 0);
  assert.equal(failed.status, 'queued');
  const reclaimedImmediately = claimTask('test-worker-2');
  assert.ok(reclaimedImmediately);
  assert.equal(reclaimedImmediately.id, enq.id);
});

test('an empty queue returns null from claimTask, not an error', () => {
  // Drain anything left over from the prior tests in this same temp DB.
  let c;
  while ((c = claimTask('drainer'))) ackTask(c.id, 'drainer', { drained: true });
  assert.equal(claimTask('drainer'), null);
});
