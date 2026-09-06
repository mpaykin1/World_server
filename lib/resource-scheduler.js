'use strict';
// RESOURCE_SCHEDULER - real root-cause fix for a bug found live this
// session: a 1.19GB Godot export-templates download running concurrently
// with `agent_implement` (which calls a REMOTE free-hosted OpenCode model)
// caused genuine timeouts that were misclassified as "model timeout" -
// direct re-runs of the exact same task with no competing download
// succeeded in 10-13 seconds. The model was never the problem; unmanaged
// concurrent NETWORK_HEAVY + LLM_REMOTE resource usage was.
//
// This does NOT duplicate lib/collective-brain's lease system - it reuses
// acquireLease/releaseLease (the same file-based primitive `cycle()` and
// the remote-bridge worker already use) as the actual mutual-exclusion
// mechanism, adding only: resource-class taxonomy, a conflict table, and
// a simple free-memory-based adaptive concurrency signal (the only OS
// metric Node can read reliably and cross-platform without a new
// dependency - os.loadavg() is well known to always report [0,0,0] on
// Windows, so it is deliberately NOT used here or presented as if it
// were meaningful).
const os = require('os');
const collectiveBrain = require('./collective-brain');

const RESOURCE_CLASSES = Object.freeze([
  'NETWORK_HEAVY', 'CPU_HEAVY', 'MEMORY_HEAVY', 'LLM_LOCAL', 'LLM_REMOTE', 'BUILD', 'LIGHTWEIGHT',
]);

// Which classes must not run concurrently with which - conservative and
// based on the real incident above: a big download (NETWORK_HEAVY) starves
// a remote LLM call's (LLM_REMOTE) bandwidth; a Godot export (BUILD) is
// CPU/disk heavy enough to starve another CPU_HEAVY/BUILD task; local
// Ollama inference (LLM_LOCAL) competes for CPU with BUILD/CPU_HEAVY work
// on a CPU-only host. LIGHTWEIGHT never conflicts with anything.
const CONFLICTS = {
  NETWORK_HEAVY: ['NETWORK_HEAVY', 'LLM_REMOTE'],
  LLM_REMOTE: ['NETWORK_HEAVY', 'LLM_REMOTE'],
  CPU_HEAVY: ['CPU_HEAVY', 'BUILD', 'LLM_LOCAL'],
  BUILD: ['BUILD', 'CPU_HEAVY', 'LLM_LOCAL'],
  LLM_LOCAL: ['LLM_LOCAL', 'CPU_HEAVY', 'BUILD'],
  MEMORY_HEAVY: ['MEMORY_HEAVY'],
  LIGHTWEIGHT: [],
};

// Best-effort mapping from a known bridge command / internal task label to
// its resource class(es) - extend this list as new heavy commands are
// added, rather than guessing per-call.
const COMMAND_RESOURCE_CLASSES = {
  agent_implement: ['LLM_REMOTE'],
  agent_implement_local: ['LLM_LOCAL'],
  agent_autofix: ['LLM_REMOTE'],
  ai_query: ['LLM_LOCAL'],
  build_native: ['BUILD', 'CPU_HEAVY'],
  build_web: ['CPU_HEAVY'],
  run_release_gate: ['CPU_HEAVY'],
  run_performance_benchmark: ['CPU_HEAVY'],
  run_visual_regression: ['CPU_HEAVY'],
  run_integration_tests: ['CPU_HEAVY'],
  large_download: ['NETWORK_HEAVY'],
};

function classesForCommand(command) {
  return COMMAND_RESOURCE_CLASSES[command] || ['LIGHTWEIGHT'];
}

// Adaptive signal: free-memory ratio is the one metric os.* reports
// consistently on Windows. Below 15% free -> treat the system as
// congested and refuse even a second LIGHTWEIGHT-adjacent heavy slot;
// above 40% free -> allow normal concurrency. This is intentionally
// simple and named for what it actually measures - not presented as full
// CPU/GPU-aware scheduling, which was not built.
function systemPressure() {
  const total = os.totalmem();
  const free = os.freemem();
  const freeRatio = total > 0 ? free / total : 1;
  let level;
  if (freeRatio < 0.15) level = 'high';
  else if (freeRatio < 0.4) level = 'moderate';
  else level = 'low';
  return { freeRatio, level, totalBytes: total, freeBytes: free };
}

function conflictingClassesHeld(root, classes) {
  const held = [];
  for (const cls of classes) {
    for (const conflictingClass of CONFLICTS[cls] || []) {
      const lease = collectiveBrain.acquireLease(root, `resource:${conflictingClass}`, { ttlMs: 1 });
      // acquireLease with a 1ms ttl that we don't intend to keep is just a
      // cheap existence probe - if it succeeds, nothing was held, so
      // release immediately; if it fails, something real holds it.
      if (lease.ok) {
        collectiveBrain.releaseLease(root, `resource:${conflictingClass}`, lease.lease.owner);
      } else {
        held.push({ conflictingClass, existing: lease.existing || null });
      }
    }
  }
  return held;
}

// Attempts to acquire exclusive slots for every resource class this task
// needs. Returns {ok:true, release} on success (release() must be called
// when the task finishes) or {ok:false, reason, conflicts, pressure} if
// blocked - the caller decides whether to queue/retry or fail fast.
function tryAcquire(root, command, taskId) {
  const classes = classesForCommand(command);
  const pressure = systemPressure();
  if (pressure.level === 'high' && !classes.includes('LIGHTWEIGHT')) {
    return { ok: false, reason: 'system-memory-pressure-high', classes, pressure };
  }
  const conflicts = conflictingClassesHeld(root, classes);
  if (conflicts.length) {
    return { ok: false, reason: 'conflicting-resource-class-in-use', classes, conflicts, pressure };
  }
  const owner = `${taskId}:${process.pid}:${Date.now()}`;
  const acquired = [];
  // Only classes that declare themselves in their OWN conflict list (i.e.
  // are meant to be a single-at-a-time resource, per CONFLICTS above) need
  // an exclusive lease of their own. LIGHTWEIGHT deliberately does not, so
  // unlimited LIGHTWEIGHT tasks can run concurrently - a real bug caught
  // by this module's own test suite: two independent LIGHTWEIGHT tasks
  // were being serialized against each other before this fix, which
  // defeats the entire point of a "never conflicts" class.
  const selfExclusiveClasses = classes.filter((cls) => (CONFLICTS[cls] || []).includes(cls));
  for (const cls of selfExclusiveClasses) {
    const lease = collectiveBrain.acquireLease(root, `resource:${cls}`, { ttlMs: 30 * 60 * 1000, owner });
    if (!lease.ok) {
      for (const a of acquired) collectiveBrain.releaseLease(root, `resource:${a}`, owner);
      return { ok: false, reason: 'lost-race-to-another-task', classes, pressure };
    }
    acquired.push(cls);
  }
  return {
    ok: true, classes, pressure,
    release: () => { for (const cls of acquired) collectiveBrain.releaseLease(root, `resource:${cls}`, owner); },
  };
}

// Runs fn() only after acquiring the needed resource slots, releasing them
// afterward regardless of success/failure. If a conflicting class is held,
// polls with bounded backoff up to maxWaitMs before giving up (queueing
// behavior, not a hard failure, unless the wait is exhausted).
// Point 5 this cycle: a warm local Ollama model is a real, measured
// latency win (load_duration dropped from 6.16s cold to 0.01s warm - see
// lib/ollama-patch-adapter.js's unloadAllModels comment) and Ollama
// already provides it for free (5-minute default keep_alive, untouched by
// this codebase). The real risk that win creates: a warm model holds
// ~1.4-2.5GB RAM (real `ollama ps` size) it doesn't need for a BUILD-class
// task (a Native/Godot export is genuinely RAM-hungry and, thanks to
// LLM_LOCAL/BUILD/CPU_HEAVY already being mutually-conflicting classes,
// can never run concurrently with an active local-model call anyway - so
// there's no correctness reason to keep the model loaded through it).
// Freeing that RAM before such a task starts trying to acquire its slot -
// or whenever a genuine memory-pressure block is hit - is a real,
// best-effort courtesy; a failure here never blocks the caller's actual
// task.
async function unloadOllamaIfWarranted(command) {
  const classes = classesForCommand(command);
  if (!classes.includes('BUILD') && !classes.includes('CPU_HEAVY')) return;
  try { await require('./ollama-patch-adapter').unloadAllModels(); } catch { /* best effort */ }
}

async function withResourceSlot(root, command, taskId, fn, { maxWaitMs = 60000, pollIntervalMs = 2000 } = {}) {
  const start = Date.now();
  let lastBlock = null;
  await unloadOllamaIfWarranted(command);
  while (Date.now() - start < maxWaitMs) {
    const slot = tryAcquire(root, command, taskId);
    if (slot.ok) {
      try { return await fn(slot); } finally { slot.release(); }
    }
    lastBlock = slot;
    // a real memory-pressure block is exactly the other case worth
    // proactively freeing warm-model RAM for, even for a command that
    // isn't itself BUILD/CPU_HEAVY-classed - the pressure is real
    // regardless of which class hit it.
    if (slot.reason === 'system-memory-pressure-high') { try { await require('./ollama-patch-adapter').unloadAllModels(); } catch { /* best effort */ } }
    await new Promise((res) => setTimeout(res, pollIntervalMs));
  }
  return { ok: false, retriable: true, error: `resource scheduler: could not acquire a conflict-free slot within ${maxWaitMs}ms`, blockedBy: lastBlock };
}

module.exports = { RESOURCE_CLASSES, CONFLICTS, COMMAND_RESOURCE_CLASSES, classesForCommand, systemPressure, tryAcquire, withResourceSlot, unloadOllamaIfWarranted };
