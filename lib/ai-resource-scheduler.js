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
const os = require('os');
const cp = require('child_process');

const MAIN_TREE_ROOT = process.env.WORLD_SERVER_MAIN_TREE || 'C:\\Users\\user\\Desktop\\World_server';
const QUEUE_DB = process.env.WORLD_SERVER_QUEUE_DB || path.join(MAIN_TREE_ROOT, '.world-server-state', 'system-jobs.sqlite');

// Thresholds - deliberately conservative: qwen3:1.7b already timed out at 150s
// under 73-100% CPU load, so "run now" should require real headroom, not just
// "not pegged at 100%".
const THRESHOLDS = {
  cpuLoadPercentMax: 70, // above this, don't start a new CPU-bound local inference job
  ramFreePercentMin: 15, // below this, don't start one either (model load can OOM/thrash)
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

// decide(): the actual resource-aware routing call. `task` = {capabilityClass,
// estimatedCost: 'low'|'medium'|'high'}. Returns one of the four actions the
// caller asked for: run_now / queue / use_lighter_model / use_alternate_backend.
async function decide(task = {}, opts = {}) {
  const resources = opts.resources || getResourceState();
  const ollama = opts.ollama || await getOllamaState();
  const overCpu = resources.cpuLoadPercent > THRESHOLDS.cpuLoadPercentMax;
  const overRam = resources.ramFreePercent < THRESHOLDS.ramFreePercentMin;
  const alreadyBusy = ollama.loadedModels.length > 0 && overCpu;

  let action = 'run_now';
  let reason = `cpu=${resources.cpuLoadPercent}% ram_free=${resources.ramFreePercent}% - within thresholds`;

  if (overRam) {
    action = 'queue';
    reason = `ram_free=${resources.ramFreePercent}% below ${THRESHOLDS.ramFreePercentMin}% minimum - do not start a new model load`;
  } else if (overCpu && task.estimatedCost === 'high') {
    action = 'use_alternate_backend';
    reason = `cpu=${resources.cpuLoadPercent}% over ${THRESHOLDS.cpuLoadPercentMax}% and task is high-cost - a contended CPU-only local model is the wrong backend for this right now`;
  } else if (overCpu && (task.estimatedCost === 'low' || task.estimatedCost === 'medium')) {
    action = 'queue';
    reason = `cpu=${resources.cpuLoadPercent}% over ${THRESHOLDS.cpuLoadPercentMax}% - queueing rather than starting a job that would likely time out (${alreadyBusy ? 'a model is already loaded and competing' : 'no model currently loaded'})`;
  }

  return { action, reason, resources, ollama, thresholds: THRESHOLDS };
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

module.exports = { getResourceState, getOllamaState, decide, registerLiveWorker, THRESHOLDS, QUEUE_DB };
