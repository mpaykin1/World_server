'use strict';
// AI_RESOURCE_SCHEDULER
//
// Extends the existing scripts/capability-aware-scheduler.cjs (worker registry +
// capability/resource matching) and scripts/durable-job-queue.cjs (leased, durable
// job queue) with the piece that was missing for AI inference jobs: LIVE resource
// sensing and an AI-specific run-now/queue/downgrade decision. Does not replace
// either system - registers a real worker row via the existing register() and
// queues deferred work via the existing enqueue()/claim()/ack() API, so any other
// tool already reading system-jobs.sqlite (or CAPABILITY_SCHEDULER_STATUS.json)
// sees this worker and its queued jobs without a second, parallel data store.
//
// Why this exists: a live E2E test on this machine hit 100% CPU (Win32_Processor
// .LoadPercentage) while qwen3:1.7b (CPU-only, size_vram:0) tried to run an
// agentic tool-selection loop, producing repeated 150s timeouts. The fix is not
// "wait for the machine to be idle" - it's routing around contention
// automatically: run now if there's headroom, queue (and let the caller retry
// later or fall back to another backend) if not.
const path = require('path');
const { resolveMainTreeRoot, sourcePath } = require('./world-server-paths');
const os = require('os');
const cp = require('child_process');

const MAIN_TREE_ROOT = resolveMainTreeRoot();
const QUEUE_DB = process.env.WORLD_SERVER_QUEUE_DB || path.join(MAIN_TREE_ROOT, '.world-server-state', 'system-jobs.sqlite');
// durable-job-queue.cjs reads WORLD_SERVER_QUEUE_DB at module-load time (top-level
// const), so it must be set before the first require() anywhere in the process -
// forcing it here (not just documenting the default) makes this module the single
// source of truth for "which queue DB" regardless of which worktree/cwd invoked it,
// so other tools reading the canonical .world-server-state/system-jobs.sqlite see
// the same jobs this scheduler enqueues.
//
// durable-job-queue.cjs has no module.exports and its CLI-argument dispatch runs
// unconditionally at require time (not guarded by require.main===module) - it is
// a CLI-only tool, not a library. Calling it via subprocess (its own documented
// interface: `node durable-job-queue.cjs <cmd> ...args`) is therefore the correct
// integration point, not require() - confirmed by a real require() attempt
// printing the CLI's default "health" JSON as a side effect and returning {}.
if (!process.env.WORLD_SERVER_QUEUE_DB) process.env.WORLD_SERVER_QUEUE_DB = QUEUE_DB;
const QUEUE_SCRIPT = sourcePath('scripts', 'durable-job-queue.cjs');
function queueCli(...args) {
  const out = cp.execFileSync(process.execPath, [QUEUE_SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, WORLD_SERVER_QUEUE_DB: process.env.WORLD_SERVER_QUEUE_DB },
    windowsHide: true,
  });
  return JSON.parse(out);
}

// Thresholds - deliberately conservative: qwen3:1.7b already timed out at 150s
// under 73-100% CPU load, so "run now" should require real headroom, not just
// "not pegged at 100%".
const THRESHOLDS = {
  cpuLoadPercentMax: 70, // above this, don't start a new CPU-bound local inference job
  ramFreePercentMin: 15, // below this, don't start one either (model load can OOM/thrash)
  // A COLD model load (not currently resident in Ollama per /api/ps) needs a much
  // higher RAM bar than a warm dispatch. Live-measured: a trivial "hi" call with
  // ram_free=33-40% (well above ramFreePercentMin) still took total_duration=6451s
  // (107.5 min) of which load_duration alone was 6443s - prompt/eval were both
  // normal (5.3s/2.8s) once the model was actually resident. This is OS-level
  // memory+disk thrashing under genuine multi-process system pressure, invisible
  // to a plain CPU% reading - see error-prevention-registry.json#ollama-model-
  // load-thrashing-under-extreme-system-pressure.
  ramFreePercentMinForColdLoad: 40,
};

function getWindowsResourceState() {
  // A single combined query is cheaper than three separate PowerShell invocations
  // (~150-300ms process-spawn overhead each) - important since this function runs
  // on the hot path before every dispatch decision.
  const script = `
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$totalMb = [math]::Round($os.TotalVisibleMemorySize/1024,0)
$freeMb = [math]::Round($os.FreePhysicalMemory/1024,0)
$cores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
[PSCustomObject]@{cpuLoadPercent=$cpu; ramTotalMb=$totalMb; ramFreeMb=$freeMb; logicalCores=$cores} | ConvertTo-Json -Compress
`.trim();
  try {
    const out = cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const j = JSON.parse(out.trim());
    return {
      cpuLoadPercent: Number(j.cpuLoadPercent) || 0,
      ramTotalMb: Number(j.ramTotalMb) || 0,
      ramFreeMb: Number(j.ramFreeMb) || 0,
      ramFreePercent: j.ramTotalMb ? Math.round((Number(j.ramFreeMb) / Number(j.ramTotalMb)) * 100) : 100,
      logicalCores: Number(j.logicalCores) || os.cpus().length,
      source: 'powershell-wmi',
    };
  } catch (e) {
    // Fail open with a conservative unknown-load posture rather than crashing the
    // caller's dispatch path - a resource-sensing failure should degrade to
    // "queue it to be safe", not silently proceed as if the machine were idle.
    return { cpuLoadPercent: 100, ramFreePercent: 0, logicalCores: os.cpus().length, source: 'unavailable-assume-loaded', error: e.message };
  }
}

function getResourceState() {
  if (process.platform === 'win32') return getWindowsResourceState();
  // POSIX fallback via loadavg (Windows always returns [0,0,0] for this, which is
  // why it isn't the primary path above).
  const [load1] = os.loadavg();
  const cores = os.cpus().length || 1;
  const freeMb = Math.round(os.freemem() / 1048576);
  const totalMb = Math.round(os.totalmem() / 1048576);
  return { cpuLoadPercent: Math.min(100, Math.round((load1 / cores) * 100)), ramTotalMb: totalMb, ramFreeMb: freeMb, ramFreePercent: totalMb ? Math.round((freeMb / totalMb) * 100) : 100, logicalCores: cores, source: 'os-loadavg' };
}

async function getOllamaState(ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434') {
  try {
    const res = await fetch(`${ollamaUrl}/api/ps`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { up: false, loadedModels: [] };
    const j = await res.json();
    return { up: true, loadedModels: (j.models || []).map((m) => ({ name: m.name, sizeVram: m.size_vram, contextLength: m.context_length })) };
  } catch (e) {
    return { up: false, loadedModels: [], error: e.message };
  }
}

// findLighterCandidate(): task -> suitable models -> resources -> fastest viable
// backend -> queue ONLY if none viable. Before giving up and queueing under CPU
// pressure, check whether a smaller candidate (by data/model-registry.json
// sizeGb) for this capability class is both (a) not already known-unsuitable per
// the live suitability ledger and (b) lighter than the currently preferred
// model - if so, recommend it instead of queueing. Lazily required to avoid a
// hard circular-dependency risk between the two modules at load time.
function findLighterCandidate(capabilityClass, currentModel, opts = {}) {
  const { candidatesFor, isSuitable, scoreBackend } = require('./model-suitability');
  const registry = (() => { try { return JSON.parse(require('fs').readFileSync(opts.registryPath || require('path').join(__dirname, '..', 'data', 'model-registry.json'), 'utf8')); } catch { return { models: {} }; } })();
  const candidates = candidatesFor(capabilityClass, opts.registryPath);
  const currentSize = registry.models[currentModel] ? registry.models[currentModel].sizeGb : Infinity;
  const lighter = candidates
    .filter((m) => m !== currentModel)
    .filter((m) => registry.models[m] && registry.models[m].sizeGb < currentSize)
    .filter((m) => isSuitable(m, capabilityClass, opts).suitable)
    .sort((a, b) => registry.models[a].sizeGb - registry.models[b].sizeGb);
  if (!lighter.length) return null;
  return { model: lighter[0], sizeGb: registry.models[lighter[0]].sizeGb, score: scoreBackend(lighter[0], capabilityClass, opts) };
}

// decide(): the actual resource-aware routing call. `task` = {capabilityClass,
// estimatedCost: 'low'|'medium'|'high', currentModel}. Returns one of: run_now
// (optionally with recommendedModel set to a lighter candidate) / queue /
// use_alternate_backend.
async function decide(task = {}, opts = {}) {
  const resources = opts.resources || getResourceState();
  const ollama = opts.ollama || await getOllamaState();
  const overCpu = resources.cpuLoadPercent > THRESHOLDS.cpuLoadPercentMax;
  const overRam = resources.ramFreePercent < THRESHOLDS.ramFreePercentMin;
  const alreadyBusy = ollama.loadedModels.length > 0 && overCpu;
  const isColdLoad = task.currentModel ? !ollama.loadedModels.some((m) => m.name === task.currentModel) : false;
  const overRamForColdLoad = isColdLoad && resources.ramFreePercent < THRESHOLDS.ramFreePercentMinForColdLoad;

  let action = 'run_now';
  let reason = `cpu=${resources.cpuLoadPercent}% ram_free=${resources.ramFreePercent}% - within thresholds`;
  let recommendedModel = null;

  if (overRam) {
    action = 'queue';
    reason = `ram_free=${resources.ramFreePercent}% below ${THRESHOLDS.ramFreePercentMin}% minimum - do not start a new model load`;
  } else if (overRamForColdLoad) {
    action = 'queue';
    reason = `${task.currentModel} is not currently resident in Ollama (cold load required) and ram_free=${resources.ramFreePercent}% is below the ${THRESHOLDS.ramFreePercentMinForColdLoad}% cold-load minimum - a cold load under this much memory pressure risks OS-level thrashing (observed: 107min load time in exactly this scenario), not just a slow-but-bounded dispatch`;
  } else if (overCpu && task.estimatedCost === 'high') {
    action = 'use_alternate_backend';
    reason = `cpu=${resources.cpuLoadPercent}% over ${THRESHOLDS.cpuLoadPercentMax}% and task is high-cost - a contended CPU-only local model is the wrong backend for this right now`;
  } else if (overCpu && (task.estimatedCost === 'low' || task.estimatedCost === 'medium')) {
    const lighter = task.capabilityClass ? findLighterCandidate(task.capabilityClass, task.currentModel, opts) : null;
    if (lighter) {
      action = 'run_now';
      recommendedModel = lighter.model;
      reason = `cpu=${resources.cpuLoadPercent}% over ${THRESHOLDS.cpuLoadPercentMax}% - found a lighter suitable candidate (${lighter.model}, ${lighter.sizeGb}GB) instead of queueing`;
    } else {
      action = 'queue';
      reason = `cpu=${resources.cpuLoadPercent}% over ${THRESHOLDS.cpuLoadPercentMax}% and no lighter suitable candidate found - queueing rather than starting a job that would likely time out (${alreadyBusy ? 'a model is already loaded and competing' : 'no model currently loaded'})`;
    }
  }

  return { action, reason, recommendedModel, isColdLoad, resources, ollama, thresholds: THRESHOLDS };
}

// Thin wrapper around the existing capability-aware-scheduler's register(), fed
// with LIVE resource numbers instead of static os.cpus().length/os.totalmem() -
// this is the actual "extend, don't duplicate" integration point: other tools
// reading CAPABILITY_SCHEDULER_STATUS.json or the workers table see the real
// current headroom for this machine's Ollama worker, not just its static capacity.
function registerLiveWorker(scheduler, id = `ollama-local-${os.hostname()}`) {
  const resources = getResourceState();
  const caps = { ...scheduler.localCaps(), ollama: true };
  const liveResources = { ...scheduler.localResources(), cpuLoadPercent: resources.cpuLoadPercent, ramFreePercent: resources.ramFreePercent, cpuAvailablePercent: Math.max(0, 100 - resources.cpuLoadPercent) };
  return scheduler.register(id, caps, liveResources);
}

// enqueueTask(): actually persists a deferred AI task into the shared durable
// queue (not just returning a "QUEUED" label with nothing behind it) so a later
// drain pass (scripts/anythingllm-queue-drain.cjs) can pick it up once resources
// free up - this is the "OpenHuman becomes additional compute, not a blocker"
// half of the resource-aware gate: a job that can't run now is retained, not lost.
//
// Default maxAttempts raised 3 -> 50: durable-job-queue.cjs#claim() increments
// the attempts counter on EVERY claim, unconditionally - not just on a genuine
// execution failure. scripts/anythingllm-queue-drain.cjs's "still contended,
// requeue" path (a deferral, not a failure - the job was never actually run)
// still consumes one of those attempts. Live-observed: a real, valid task got
// permanently dead-lettered after exactly 3 consecutive "still contended"
// re-checks during sustained real CPU load, without ever once being executed -
// the queue's own retry budget defeated the "wait for a window" design it
// exists to serve. 50 gives ~25 minutes of headroom at the drain loop's 30s
// tick interval before a genuinely stuck job is abandoned.
function enqueueTask(payload, opts = {}) {
  const args = ['enqueue', 'anythingllm-task', JSON.stringify(payload), String(opts.priority || 0), String(opts.maxAttempts || 50)];
  if (opts.dedupe) args.push(opts.dedupe);
  return queueCli(...args);
}

function claimTask(worker = `ollama-drain-${os.hostname()}`, leaseMs = 300000) {
  const r = queueCli('claim', worker, String(leaseMs));
  return r ? { ...r, payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload } : null;
}

function ackTask(id, worker, result) {
  return queueCli('ack', id, worker, JSON.stringify(result));
}

function failTask(id, worker, error, retryDelayMs) {
  return queueCli('fail', id, worker, String(error), String(retryDelayMs ?? 5000));
}

module.exports = { getResourceState, getOllamaState, decide, registerLiveWorker, enqueueTask, claimTask, ackTask, failTask, THRESHOLDS, QUEUE_DB, QUEUE_SCRIPT, MAIN_TREE_ROOT };
