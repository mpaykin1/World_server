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
