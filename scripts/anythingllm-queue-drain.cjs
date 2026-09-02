#!/usr/bin/env node
'use strict';
// ANYTHINGLLM_QUEUE_DRAIN
//
// Claims one deferred "anythingllm-task" job from the shared durable queue
// (lib/ai-resource-scheduler.js#enqueueTask put it there when the resource gate
// said "queue" instead of "run_now") and actually executes it now, re-checking
// resources first. This is the other half of "OpenHuman becomes additional
// compute, not a blocker" - a queued job gets retried automatically, not lost.
// Intended to be invoked periodically (e.g. from an existing scheduler tick, or
// a cron-style loop) rather than run once and forgotten.
const { claimTask, ackTask, failTask, decide } = require('../lib/ai-resource-scheduler');
const { runTask } = require('./anythingllm-task-router.cjs');

async function drainOne(worker) {
  const job = claimTask(worker);
  if (!job) return { drained: false, reason: 'queue empty' };
  const payload = job.payload;
  const gate = await decide({ capabilityClass: payload.capabilityClass, estimatedCost: 'low' });
  if (gate.action !== 'run_now') {
    // Still contended - release it back to the queue rather than failing it, so
    // it gets picked up on a future drain instead of burning an attempt.
    failTask(job.id, worker, `still contended: ${gate.reason}`, 30000);
    return { drained: false, reason: 'still contended, requeued', jobId: job.id, gate };
  }
  try {
    const result = await runTask(payload.taskText, { workspaceSlug: payload.workspaceSlug, threadSlug: payload.threadSlug, timeoutMs: payload.timeoutMs, respectResourceGate: false });
    ackTask(job.id, worker, result);
    return { drained: true, jobId: job.id, result };
  } catch (e) {
    failTask(job.id, worker, e.message);
    return { drained: true, jobId: job.id, error: e.message };
  }
}

module.exports = { drainOne };

if (require.main === module) {
  const worker = process.argv[2] || `drain-${process.pid}`;
  drainOne(worker).then((r) => { console.log(JSON.stringify(r, null, 2)); }).catch((e) => { console.error(e); process.exitCode = 1; });
}
