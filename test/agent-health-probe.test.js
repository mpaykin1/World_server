'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const probe = require('../lib/agent-health-probe');

const T1_OK = { opencodeOk: true, ollamaOk: true, network: true, modelsListed: ['opencode/mimo-v2.5-free'] };

test('classify: MODEL_UNAVAILABLE when opencode CLI itself is not present', () => {
  const r = probe.classify({ ...T1_OK, opencodeOk: false }, null);
  assert.equal(r.state, 'MODEL_UNAVAILABLE');
});

test('classify: NETWORK_DEGRADED when basic reachability check fails, even if opencode is installed', () => {
  const r = probe.classify({ ...T1_OK, network: false }, null);
  assert.equal(r.state, 'NETWORK_DEGRADED');
});

test('classify: MODEL_UNAVAILABLE when opencode lists zero models', () => {
  const r = probe.classify({ ...T1_OK, modelsListed: [] }, null);
  assert.equal(r.state, 'MODEL_UNAVAILABLE');
});

test('classify: RATE_LIMITED only fires on real observed 429/rate-limit text, never guessed', () => {
  const r = probe.classify(T1_OK, { durationMs: 5000, timedOut: false, exitCode: 0, rateLimited: true, gotAnyOutput: true, stderrTail: '429 Too Many Requests' });
  assert.equal(r.state, 'RATE_LIMITED');
});

test('classify: LOCAL_PROCESS_HANG when the probe call times out with zero output at all', () => {
  const r = probe.classify(T1_OK, { durationMs: 20000, timedOut: true, exitCode: 1, rateLimited: false, gotAnyOutput: false, stderrTail: '' });
  assert.equal(r.state, 'LOCAL_PROCESS_HANG');
});

test('classify: PROVIDER_DEGRADED when the probe times out but had produced some output', () => {
  const r = probe.classify(T1_OK, { durationMs: 20000, timedOut: true, exitCode: 1, rateLimited: false, gotAnyOutput: true, stderrTail: '' });
  assert.equal(r.state, 'PROVIDER_DEGRADED');
});

// Regression test for a real false positive found live this session: an
// earlier threshold (15000ms) misclassified a genuinely healthy 15281ms
// trivial-prompt response as PROVIDER_DEGRADED, which in turn caused
// implementGoal to wrongly skip its entire free-agent fallback chain for
// two otherwise-succeedable real tasks in the same benchmark run. The
// threshold was recalibrated against real observed durations (healthy
// full agent_implement edits repeatedly completing in 10-33s) - this test
// pins the corrected boundary so it cannot silently regress back down.
test('classify: HEALTHY up to 60s - regression guard against the 15s false-positive threshold found live this session', () => {
  const r = probe.classify(T1_OK, { durationMs: 15281, timedOut: false, exitCode: 0, rateLimited: false, gotAnyOutput: true, stderrTail: '' });
  assert.equal(r.state, 'HEALTHY', `a real 15281ms healthy response must not be misclassified as degraded: ${r.reason}`);
});

test('classify: PROVIDER_DEGRADED once duration genuinely exceeds every observed healthy range', () => {
  const r = probe.classify(T1_OK, { durationMs: 90000, timedOut: false, exitCode: 0, rateLimited: false, gotAnyOutput: true, stderrTail: '' });
  assert.equal(r.state, 'PROVIDER_DEGRADED');
});

test('classify: PROVIDER_DEGRADED on a real nonzero exit code', () => {
  const r = probe.classify(T1_OK, { durationMs: 5000, timedOut: false, exitCode: 1, rateLimited: false, gotAnyOutput: true, stderrTail: 'some real error' });
  assert.equal(r.state, 'PROVIDER_DEGRADED');
});

test('classify: HEALTHY on a clean, fast, real response', () => {
  const r = probe.classify(T1_OK, { durationMs: 10642, timedOut: false, exitCode: 0, rateLimited: false, gotAnyOutput: true, stderrTail: '' });
  assert.equal(r.state, 'HEALTHY');
});

test('classify: UNKNOWN (never a specific guessed label) when tier 2 was never run', () => {
  const r = probe.classify(T1_OK, null);
  assert.equal(r.state, 'UNKNOWN');
});

// --- classifyOllama: no coverage existed for this before this cycle ---

test('classifyOllama: OLLAMA_UNAVAILABLE when the HTTP API is not reachable at all', () => {
  const r = probe.classifyOllama({ available: false });
  assert.equal(r.state, 'OLLAMA_UNAVAILABLE');
});

test('classifyOllama: OLLAMA_OOM when free RAM is below the safety margin for a COLD load of the target model', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 1e9, modelSizeBytes: 2e9, wasLoaded: false, tier2: null });
  assert.equal(r.state, 'OLLAMA_OOM');
});

// --- Real bug found and fixed live this cycle: a direct call succeeded
// using a model on this exact machine, then the health probe blocked the
// SAME model moments later with OLLAMA_OOM, because the direct call's own
// success had left the model resident (reducing os.freemem() by roughly
// the model's own size), measured against the SAME cold-load margin. An
// already-loaded model needs no new weight allocation to serve another
// call - the full 1.5x-of-model-size margin must only apply before a cold
// load, not after the model is already resident. ---

test('classifyOllama: does NOT apply the cold-load 1.5x margin to an already-loaded model - only a real near-zero-RAM floor', () => {
  // freeBytes (1GB) is well below 1.5x of modelSizeBytes (2GB -> needs 3GB
  // under the old unconditional rule) but the model is already loaded -
  // this exact real scenario must now pass, not OOM.
  const r = probe.classifyOllama({ available: true, freeBytes: 1e9, modelSizeBytes: 2e9, wasLoaded: true, tier2: null });
  assert.notEqual(r.state, 'OLLAMA_OOM', 'an already-resident model must not be blocked by the cold-load margin');
});

test('classifyOllama: an already-loaded model IS still blocked once free RAM drops below the real near-zero working-memory floor', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 100 * 1024 * 1024, modelSizeBytes: 2e9, wasLoaded: true, tier2: null });
  assert.equal(r.state, 'OLLAMA_OOM', 'genuinely near-zero free RAM must still block even a warm model - this is not a blanket removal of the safety check');
});

test('classifyOllama: a NOT-yet-loaded model still gets the full cold-load margin - the fix is scoped to wasLoaded, not a global loosening', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 1e9, modelSizeBytes: 2e9, wasLoaded: false, tier2: null });
  assert.equal(r.state, 'OLLAMA_OOM', 'a genuine cold load with insufficient headroom must still be blocked');
});

test('classifyOllama: OLLAMA_MODEL_LOADING (not a failure state) when tier2 was not run and the model was not already loaded', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: false, tier2: null });
  assert.equal(r.state, 'OLLAMA_MODEL_LOADING');
});

test('classifyOllama: OLLAMA_HEALTHY (not a failure state) when tier2 was not run but the model was already loaded', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: true, tier2: null });
  assert.equal(r.state, 'OLLAMA_HEALTHY');
});

test('classifyOllama: OLLAMA_MODEL_LOADING when tier2 got zero output and the model was not yet loaded (first-call disk load, not a failure)', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: false, tier2: { ok: false, durationMs: 20000, gotAnyOutput: false } });
  assert.equal(r.state, 'OLLAMA_MODEL_LOADING');
});

test('classifyOllama: OLLAMA_SLOW when tier2 got zero output and the model WAS already loaded (a real degradation signal, not just a cold load)', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: true, tier2: { ok: false, durationMs: 20000, gotAnyOutput: false } });
  assert.equal(r.state, 'OLLAMA_SLOW');
});

// Regression guard for this cycle's real fix: think:false removed Qwen3's
// default chain-of-thought overhead (measured live: 245-511 generated
// tokens, 28-58s, for a trivial one-word-expected prompt, dropping to 3
// tokens / ~1s with think:false set). The healthy-range threshold was
// recalibrated from the old 30000ms (tuned for the thinking-inflated
// baseline) down to 10000ms (real cold-load worst case ~7.5s) - this pins
// the new boundary so a future change can't silently widen it back out
// without a deliberate, evidenced reason.
test('classifyOllama: OLLAMA_HEALTHY for a real post-think:false cold-load duration (~7.5s)', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: false, tier2: { ok: true, durationMs: 7500, gotAnyOutput: true } });
  assert.equal(r.state, 'OLLAMA_HEALTHY');
});

test('classifyOllama: OLLAMA_SLOW once duration exceeds the recalibrated 10s healthy range', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: true, tier2: { ok: true, durationMs: 10001, gotAnyOutput: true } });
  assert.equal(r.state, 'OLLAMA_SLOW');
});

test('classifyOllama: a real pre-fix thinking-mode duration (30s+) is now correctly classified SLOW, not silently accepted as healthy', () => {
  const r = probe.classifyOllama({ available: true, freeBytes: 8e9, modelSizeBytes: 1e9, wasLoaded: true, tier2: { ok: true, durationMs: 30000, gotAnyOutput: true } });
  assert.equal(r.state, 'OLLAMA_SLOW');
});
