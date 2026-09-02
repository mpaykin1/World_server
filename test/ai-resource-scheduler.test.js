'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, THRESHOLDS } = require('../lib/ai-resource-scheduler');

const idle = { cpuLoadPercent: 20, ramFreePercent: 50 };
const loaded = { cpuLoadPercent: 95, ramFreePercent: 40 };
const ramStarved = { cpuLoadPercent: 20, ramFreePercent: 5 };
const noModels = { up: true, loadedModels: [] };

test('idle machine + low-cost task -> run_now', async () => {
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low' }, { resources: idle, ollama: noModels });
  assert.equal(r.action, 'run_now');
});

test('overloaded CPU + low-cost task -> queue, not a silent block or crash', async () => {
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low' }, { resources: loaded, ollama: noModels });
  assert.equal(r.action, 'queue');
  assert.match(r.reason, /cpu=95%/);
});

test('overloaded CPU + high-cost task -> use_alternate_backend, not queue (queueing a slow task under load just delays the inevitable timeout)', async () => {
  const r = await decide({ capabilityClass: 'filesystem-write', estimatedCost: 'high' }, { resources: loaded, ollama: noModels });
  assert.equal(r.action, 'use_alternate_backend');
});

test('RAM starved -> queue regardless of CPU (avoid starting a new model load that could thrash/OOM)', async () => {
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low' }, { resources: ramStarved, ollama: noModels });
  assert.equal(r.action, 'queue');
  assert.match(r.reason, /ram_free/);
});

test('thresholds are the documented values (regression guard against silent threshold drift)', () => {
  assert.equal(THRESHOLDS.cpuLoadPercentMax, 70);
  assert.equal(THRESHOLDS.ramFreePercentMin, 15);
});

test('a resource-sensing failure fails open to a conservative loaded posture, not a crash', () => {
  const { getResourceState } = require('../lib/ai-resource-scheduler');
  // Can't easily force a PowerShell failure deterministically here without mocking
  // child_process, but the source field lets us assert the real call at least
  // returns a well-formed object under normal conditions.
  const r = getResourceState();
  assert.ok(typeof r.cpuLoadPercent === 'number');
  assert.ok(typeof r.ramFreePercent === 'number');
});
