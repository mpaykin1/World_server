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

module.exports = { probe, classify, tier1, tier2, networkReachable, DEFAULT_CACHE_TTL_MS };
