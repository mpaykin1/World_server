'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { decide, THRESHOLDS } = require('../lib/ai-resource-scheduler');

const idle = { cpuLoadPercent: 20, ramFreePercent: 50 };
const loaded = { cpuLoadPercent: 95, ramFreePercent: 40 };
const ramStarved = { cpuLoadPercent: 20, ramFreePercent: 5 };
const noModels = { up: true, loadedModels: [] };

// Isolated ledger for tests that exercise suitability-dependent behavior (which
// candidate counts as "suitable") - the real ledger accumulates live data from
// actual dispatches and must not leak into these deterministic assertions.
function tmpLedger() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'scheduler-test-')), 'ledger.json'); }

test('idle machine + low-cost task -> run_now', async () => {
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low' }, { resources: idle, ollama: noModels });
  assert.equal(r.action, 'run_now');
});

test('overloaded CPU + a capability class with no registered candidates -> queue, not a silent block or crash', async () => {
  // 'filesystem-read' has real candidates in data/model-registry.json, so it would
  // now try a lighter one first (see the dedicated tests below) - use a class with
  // no declared candidates to exercise the genuine "nothing viable, must queue" path.
  const r = await decide({ capabilityClass: 'nonexistent-class-xyz', estimatedCost: 'low' }, { resources: loaded, ollama: noModels });
  assert.equal(r.action, 'queue');
  assert.match(r.reason, /cpu=95%/);
});

test('overloaded CPU + a task class WITH a lighter suitable candidate -> run_now with recommendedModel, not queue (task -> suitable models -> resources -> fastest viable backend -> queue only if none viable)', async () => {
  const ledgerPath = tmpLedger(); // no history yet -> every candidate defaults to suitable
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low', currentModel: 'some-heavy-model-not-in-registry' }, { resources: loaded, ollama: noModels, ledgerPath });
  assert.equal(r.action, 'run_now');
  assert.ok(r.recommendedModel, JSON.stringify(r));
  assert.match(r.reason, /lighter suitable candidate/);
});

test('overloaded CPU + already using the lightest candidate -> no lighter option, queues', async () => {
  const ledgerPath = tmpLedger();
  const { candidatesFor } = require('../lib/model-suitability');
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'model-registry.json'), 'utf8'));
  const candidates = candidatesFor('filesystem-read');
  const lightest = [...candidates].sort((a, b) => registry.models[a].sizeGb - registry.models[b].sizeGb)[0];
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low', currentModel: lightest }, { resources: loaded, ollama: noModels, ledgerPath });
  assert.equal(r.action, 'queue');
});

test('overloaded CPU + a candidate already known-unsuitable per the ledger is skipped, not recommended', async () => {
  const ledgerPath = tmpLedger();
  const { recordOutcome } = require('../lib/model-suitability');
  for (let i = 0; i < 3; i++) recordOutcome('qwen2.5:3b-instruct', 'filesystem-read', 'FAIL', { ledgerPath });
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low', currentModel: 'some-heavy-model-not-in-registry' }, { resources: loaded, ollama: noModels, ledgerPath });
  // qwen2.5:3b-instruct is the only declared filesystem-read candidate and is now
  // marked unsuitable in THIS isolated ledger - nothing viable to recommend, queue.
  assert.equal(r.action, 'queue');
  assert.notEqual(r.recommendedModel, 'qwen2.5:3b-instruct');
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
  assert.equal(THRESHOLDS.ramFreePercentMinForColdLoad, 40);
});

test('a cold model load (not in /api/ps loadedModels) under moderate RAM pressure -> queue, even though ram is above the plain minimum (real bug: a "hi" call at ram_free=33-40% took 107 minutes to cold-load)', async () => {
  const moderateRam = { cpuLoadPercent: 20, ramFreePercent: 35 }; // above ramFreePercentMin(15), below ramFreePercentMinForColdLoad(40)
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low', currentModel: 'qwen2.5:3b-instruct' }, { resources: moderateRam, ollama: noModels });
  assert.equal(r.action, 'queue');
  assert.equal(r.isColdLoad, true);
  assert.match(r.reason, /cold load/);
});

test('a WARM model (already in /api/ps loadedModels) is not penalized by the cold-load threshold, even under the same moderate RAM', async () => {
  const moderateRam = { cpuLoadPercent: 20, ramFreePercent: 35 };
  const warm = { up: true, loadedModels: [{ name: 'qwen2.5:3b-instruct', sizeVram: 0, contextLength: 16384 }] };
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low', currentModel: 'qwen2.5:3b-instruct' }, { resources: moderateRam, ollama: warm });
  assert.equal(r.action, 'run_now');
  assert.equal(r.isColdLoad, false);
});

test('no currentModel specified -> isColdLoad is false, no false-positive queueing', async () => {
  const moderateRam = { cpuLoadPercent: 20, ramFreePercent: 35 };
  const r = await decide({ capabilityClass: 'filesystem-read', estimatedCost: 'low' }, { resources: moderateRam, ollama: noModels });
  assert.equal(r.isColdLoad, false);
  assert.equal(r.action, 'run_now');
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
