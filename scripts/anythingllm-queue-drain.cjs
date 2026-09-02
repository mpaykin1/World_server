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

// watchLoop(): point 4's "auto-drain when a window opens" - a lightweight loop
// that periodically re-checks resources and drains the queue itself, so a
// queued job gets retried automatically rather than requiring a human (or an
// external scheduler) to remember to invoke drainOne again. Intended to be
// started once (as a background process, or by whatever existing periodic-tick
// infrastructure the caller already has - this does not create a competing
// scheduler, it's just the drain step) and left running.
async function watchLoop(worker, intervalMs = 30000, opts = {}) {
  const maxTicks = opts.maxTicks || Infinity;
  for (let tick = 0; tick < maxTicks; tick++) {
    const r = await drainOne(`${worker}-tick${tick}`);
    if (opts.onTick) opts.onTick(r, tick);
    if (opts.stopWhenEmpty && r.reason === 'queue empty') break;
    if (tick < maxTicks - 1) await new Promise((res) => setTimeout(res, intervalMs));
  }
}

module.exports = { drainOne, watchLoop };

if (require.main === module) {
  const args = process.argv.slice(2);
  const watchIdx = args.indexOf('--watch');
  if (watchIdx !== -1) {
    const worker = args[0] && !args[0].startsWith('--') ? args[0] : `drain-${process.pid}`;
    const intervalMs = Number(args[watchIdx + 1]) || 30000;
    console.error(`[ANYTHINGLLM_QUEUE_DRAIN] watching, interval=${intervalMs}ms`);
    watchLoop(worker, intervalMs, { onTick: (r, tick) => console.error(`[tick ${tick}] ${JSON.stringify(r)}`) })
      .catch((e) => { console.error(e); process.exitCode = 1; });
  } else {
    const worker = args[0] || `drain-${process.pid}`;
    drainOne(worker).then((r) => { console.log(JSON.stringify(r, null, 2)); }).catch((e) => { console.error(e); process.exitCode = 1; });
  }
}
