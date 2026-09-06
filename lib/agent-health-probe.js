'use strict';
// AGENT_HEALTH_PROBE
//
// Direct response to an explicit instruction: do not accept the
// "rate-limiting" hypothesis for the prior round's 0/3 E2E result without
// evidence. This runs a real, fast, cheap-first sequence of checks and
// classifies the actual observed state instead of guessing - and, when run
// before a real task, lets the caller skip a 10-20 minute fallback chain
// entirely if the provider is already visibly degraded.
//
// Two tiers, cheap ones first:
//   Tier 1 (near-instant, no live model call): opencode CLI present,
//   `opencode models` lists the free tier, Ollama reachable, basic
//   internet reachability (a HEAD request to a neutral, already-trusted
//   endpoint - never opencode's own infra, to avoid adding to the very
//   load this probe exists to detect).
//   Tier 2 (one bounded live call, ~20s cap): a single trivial prompt
//   against the free tier. Its outcome is the actual evidence - completed
//   fast/slow/not at all, real stderr content, whether the process exited
//   cleanly or had to be killed.
//
// Classification is derived from what was actually observed, not assumed:
// HEALTHY, RATE_LIMITED (only if a 429/rate-limit string is actually
// present in the response), PROVIDER_DEGRADED (completed, but slow),
// NETWORK_DEGRADED (Tier 1 network check failed), LOCAL_PROCESS_HANG
// (Tier 2 never produced any output and had to be killed),
// MODEL_UNAVAILABLE (opencode/Ollama itself not available), UNKNOWN
// (something failed in a way none of the above cleanly explains - never
// silently defaults to a specific-sounding but unproven label).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const agentAdapters = require('./agent-adapters');

const PROBE_CACHE_PATH_FN = (root) => path.join(root, 'data', 'collective-brain', 'runtime', 'agent-health-probe-cache.json');
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // a fresh probe before every single task would itself add load

async function networkReachable(timeoutMs = 5000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch('https://api.github.com', { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status < 500; // any real HTTP response means the network path works
  } catch { return false; }
}

async function tier1(root) {
  const opencodeOk = await agentAdapters.opencodeAvailable();
  const ollamaOk = await agentAdapters.ollamaAvailable();
  const network = await networkReachable();
  let modelsListed = [];
  if (opencodeOk) {
    const r = spawnSync('opencode', ['models'], { encoding: 'utf8', timeout: 15000, windowsHide: true, shell: true });
    if (r.status === 0) modelsListed = String(r.stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  }
  return { opencodeOk, ollamaOk, network, modelsListed };
}

// One bounded, real, minimal probe call - direct evidence, not inference.
async function tier2(timeoutMs = 20000) {
  const goalFile = path.join(os.tmpdir(), `health-probe-${Date.now()}.txt`);
  fs.writeFileSync(goalFile, 'Reply with exactly one word: HEALTHY');
  const start = Date.now();
  const r = await agentAdapters.runWithTreeKill('opencode', ['run', '--model', agentAdapters.FREE_OPENCODE_MODELS[0], '--dir', os.tmpdir(), '--format', 'json', 'Follow the instructions in the attached file exactly.', '-f', goalFile], { timeout: timeoutMs });
  try { fs.unlinkSync(goalFile); } catch { /* best effort */ }
  const durationMs = Date.now() - start;
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  const combined = `${r.stdout || ''}\n${r.stderr || ''}`;
  const rateLimited = /rate.?limit|429|too many requests/i.test(combined);
  const gotAnyOutput = String(r.stdout || '').trim().length > 0;
  return { durationMs, timedOut, exitCode: r.status, rateLimited, gotAnyOutput, stderrTail: String(r.stderr || '').slice(-500) };
}

function classify(t1, t2) {
  if (!t1.opencodeOk) return { state: 'MODEL_UNAVAILABLE', reason: 'opencode CLI not available on this host' };
  if (!t1.network) return { state: 'NETWORK_DEGRADED', reason: 'basic internet reachability check (api.github.com) failed' };
  if (!t1.modelsListed.length) return { state: 'MODEL_UNAVAILABLE', reason: '`opencode models` returned no models' };
  if (!t2) return { state: 'UNKNOWN', reason: 'tier 2 probe was not run' };
  if (t2.rateLimited) return { state: 'RATE_LIMITED', reason: `real rate-limit/429 text observed in output: ${t2.stderrTail.slice(0, 200)}` };
  if (t2.timedOut && !t2.gotAnyOutput) return { state: 'LOCAL_PROCESS_HANG', reason: `trivial one-word prompt produced zero output and had to be killed after ${t2.durationMs}ms - this is not the model being slow, this is the process not responding at all` };
  if (t2.timedOut && t2.gotAnyOutput) return { state: 'PROVIDER_DEGRADED', reason: `trivial prompt produced partial output but did not complete within the probe's own timeout (${t2.durationMs}ms)` };
  if (t2.exitCode !== 0) return { state: 'PROVIDER_DEGRADED', reason: `trivial prompt exited ${t2.exitCode}: ${t2.stderrTail.slice(0, 300)}` };
  // Threshold recalibrated from real evidence gathered this session, not
  // guessed: a genuinely healthy free-tier call - including full
  // agent_implement attempts that write real files, heavier than this
  // trivial probe - was repeatedly observed completing in 10-33s. The
  // original 15000ms cutoff was set from a single early sample and, once
  // more data came in, turned out to be a false-positive generator: it
  // once blocked two entirely legitimate tasks in the same benchmark run
  // where a third, heavier real task succeeded in 32.9s. This value leaves
  // real margin above every real duration observed so far.
  if (t2.durationMs > 60000) return { state: 'PROVIDER_DEGRADED', reason: `trivial one-word prompt took ${t2.durationMs}ms - well beyond the 10-33s range repeatedly observed for real healthy calls (including full file-editing tasks), real evidence of degraded latency` };
  return { state: 'HEALTHY', reason: `trivial prompt completed cleanly in ${t2.durationMs}ms` };
}

async function probe(root, { deep = true, useCache = true, cacheTtlMs = DEFAULT_CACHE_TTL_MS } = {}) {
  const cachePath = PROBE_CACHE_PATH_FN(root);
  if (useCache) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (Date.now() - Date.parse(cached.at) < cacheTtlMs) return { ...cached, fromCache: true };
    } catch { /* no cache yet, or expired - run a real probe */ }
  }

  const t1 = await tier1(root);
  const t2 = deep && t1.opencodeOk && t1.network ? await tier2() : null;
  const result = classify(t1, t2);
  const report = { ...result, tier1: t1, tier2: t2, at: new Date().toISOString() };
  try { fs.mkdirSync(path.dirname(cachePath), { recursive: true }); fs.writeFileSync(cachePath, JSON.stringify(report, null, 2)); } catch { /* best effort */ }
  return { ...report, fromCache: false };
}

// OLLAMA HEALTH PROBE
//
// Same evidence-first philosophy as the OpenCode probe above, extended for
// this cycle's local structured-patch fallback (lib/ollama-patch-adapter.js).
// Real, measured evidence this cycle (see OLLAMA_MODEL_BENCHMARK.json and
// the timeout comment in lib/ollama-patch-adapter.js): on this project's
// actual CPU-only dev hardware, a real ~5KB scoped file took ~100s of
// mostly prompt-EVALUATION time (not generation) even on the smallest
// installed model. So "slow" here is calibrated against that real
// baseline, not against the OpenCode probe's much lower thresholds - local
// CPU inference is legitimately, structurally slower than a remote hosted
// call, and classifying it "degraded" at OpenCode-probe speeds would make
// this probe useless (it would always report degraded).
// Recalibrated after the real root cause behind production Ollama
// timeouts was found and fixed this cycle: queryOllama now sends
// think:false, so a trivial prompt no longer pays for Qwen3's unbounded
// default chain-of-thought (previously measured 245-511 generated tokens,
// 28-58s, for a call that should answer in one word). With that removed,
// a real cold-load call measured ~7.5s worst case (6.16s load + ~1s
// prompt eval + a handful of generated tokens); warm, ~1-2s. 30000ms was
// tuned for the old, thinking-inflated baseline and would no longer catch
// a real degradation - a probe this loose is not a meaningful signal.
const OLLAMA_TRIVIAL_PROMPT_HEALTHY_MS = 10000;
const OLLAMA_MIN_SAFE_FREE_BYTES_OVER_MODEL = 1.5; // free RAM must be >= 1.5x the model's on-disk size BEFORE a cold load
// Real bug found and root-caused live this cycle: a direct call (no health
// gate) succeeded in 28.3s using this exact model on this exact machine,
// then the health probe blocked the SAME model moments later with
// OLLAMA_OOM - because the direct call's own successful run had left the
// model resident in RAM (Ollama's keep_alive window), which correctly
// reduced os.freemem() by roughly the model's own size, then got measured
// against the SAME 1.5x-of-model-size margin that exists to protect a
// COLD LOAD. An already-resident model needs no new weight allocation to
// serve another call - the 1.5x margin is only meaningful before a load
// actually happens. Applying it unconditionally after the model is
// already loaded double-counts memory it is already using as if it still
// needed to be found. A small absolute floor still applies even when
// warm - inference itself needs some working memory (KV cache/context
// buffer, not the full weights again), and a machine with almost no free
// RAM at all is still a real risk regardless of load state.
const OLLAMA_MIN_SAFE_FREE_BYTES_WHEN_WARM = 400 * 1024 * 1024; // 400MB - real working-memory headroom for inference on an already-loaded model, not a full reload

async function ollamaModelsLoaded(timeoutMs = 5000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434')}/api/ps`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.models) ? data.models : [];
  } catch { return null; }
}

async function ollamaModelSizeBytes(model, timeoutMs = 5000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${(process.env.OLLAMA_URL || 'http://127.0.0.1:11434')}/api/tags`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json();
    const entry = (data.models || []).find((m) => m.name === model || m.model === model);
    return entry ? Number(entry.size) || null : null;
  } catch { return null; }
}

async function ollamaTier2(model, timeoutMs = OLLAMA_TRIVIAL_PROMPT_HEALTHY_MS + 15000) {
  const start = Date.now();
  const r = await agentAdapters.queryOllama('Reply with exactly one word: HEALTHY', { model, timeoutMs });
  const durationMs = Date.now() - start;
  return { ok: r.ok, durationMs, error: r.error || null, gotAnyOutput: !!(r.text && r.text.trim().length) };
}

function classifyOllama({ available, freeBytes, modelSizeBytes, wasLoaded, tier2 }) {
  if (!available) return { state: 'OLLAMA_UNAVAILABLE', reason: 'ollama HTTP API not reachable at ' + (process.env.OLLAMA_URL || 'http://127.0.0.1:11434') };
  if (freeBytes != null) {
    if (wasLoaded) {
      // Already resident - no cold load is about to happen, so only guard
      // against genuinely near-zero free memory, not the full cold-load
      // margin (see the real evidence in this constant's own comment).
      if (freeBytes < OLLAMA_MIN_SAFE_FREE_BYTES_WHEN_WARM) {
        return { state: 'OLLAMA_OOM', reason: `only ${(freeBytes / 1e9).toFixed(2)}GB free RAM even for an already-loaded model - below the ${(OLLAMA_MIN_SAFE_FREE_BYTES_WHEN_WARM / 1e9).toFixed(2)}GB real working-memory floor` };
      }
    } else if (modelSizeBytes != null && freeBytes < modelSizeBytes * OLLAMA_MIN_SAFE_FREE_BYTES_OVER_MODEL) {
      return { state: 'OLLAMA_OOM', reason: `only ${(freeBytes / 1e9).toFixed(2)}GB free RAM, below the ${OLLAMA_MIN_SAFE_FREE_BYTES_OVER_MODEL}x-model-size safety margin for a COLD load of a ${(modelSizeBytes / 1e9).toFixed(2)}GB model — refusing to attempt a load that could thrash or OOM this machine` };
    }
  }
  if (!tier2) return { state: wasLoaded ? 'OLLAMA_HEALTHY' : 'OLLAMA_MODEL_LOADING', reason: 'tier 2 probe not run; classified from tier 1 evidence only' };
  if (!tier2.ok || !tier2.gotAnyOutput) {
    return { state: wasLoaded ? 'OLLAMA_SLOW' : 'OLLAMA_MODEL_LOADING', reason: wasLoaded ? `model was already loaded but the trivial probe still produced no output within ${tier2.durationMs}ms` : `model was not yet loaded — first call includes real disk-load time, probe did not complete within ${tier2.durationMs}ms` };
  }
  if (tier2.durationMs > OLLAMA_TRIVIAL_PROMPT_HEALTHY_MS) {
    return { state: 'OLLAMA_SLOW', reason: `trivial one-word prompt took ${tier2.durationMs}ms, beyond the ${OLLAMA_TRIVIAL_PROMPT_HEALTHY_MS}ms real-evidence-based healthy range for a model that was already loaded` };
  }
  return { state: 'OLLAMA_HEALTHY', reason: `trivial prompt completed cleanly in ${tier2.durationMs}ms` };
}

async function probeOllama(model, { deep = true } = {}) {
  const available = await agentAdapters.ollamaAvailable();
  if (!available) return { ...classifyOllama({ available: false }), model, at: new Date().toISOString() };
  const [loaded, modelSizeBytes] = await Promise.all([ollamaModelsLoaded(), ollamaModelSizeBytes(model)]);
  const wasLoaded = Array.isArray(loaded) ? loaded.some((m) => m.name === model || m.model === model) : null;
  const freeBytes = os.freemem();
  const preCheck = classifyOllama({ available, freeBytes, modelSizeBytes, wasLoaded, tier2: null });
  if (preCheck.state === 'OLLAMA_OOM') return { ...preCheck, model, wasLoaded, freeBytes, modelSizeBytes, at: new Date().toISOString() };
  const tier2 = deep ? await ollamaTier2(model) : null;
  const result = classifyOllama({ available, freeBytes, modelSizeBytes, wasLoaded, tier2 });
  return { ...result, model, wasLoaded, freeBytes, modelSizeBytes, tier2, at: new Date().toISOString() };
}

module.exports = {
  probe, classify, tier1, tier2, networkReachable, DEFAULT_CACHE_TTL_MS,
  probeOllama, classifyOllama, OLLAMA_TRIVIAL_PROMPT_HEALTHY_MS, OLLAMA_MIN_SAFE_FREE_BYTES_OVER_MODEL,
  OLLAMA_MIN_SAFE_FREE_BYTES_WHEN_WARM,
};
