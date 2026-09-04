'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const scheduler = require('../lib/resource-scheduler');
const collectiveBrain = require('../lib/collective-brain');

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'resource-scheduler-test-'));
  fs.mkdirSync(path.join(dir, 'data', 'collective-brain'), { recursive: true });
  return dir;
}

test('classesForCommand: known heavy commands map to real resource classes, unknowns default to LIGHTWEIGHT', () => {
  assert.deepEqual(scheduler.classesForCommand('agent_implement'), ['LLM_REMOTE']);
  assert.deepEqual(scheduler.classesForCommand('build_native'), ['BUILD', 'CPU_HEAVY']);
  assert.deepEqual(scheduler.classesForCommand('totally_unknown_command'), ['LIGHTWEIGHT']);
});

test('systemPressure: reports a real, sane free-memory ratio, not a placeholder', () => {
  const p = scheduler.systemPressure();
  assert.ok(p.freeRatio >= 0 && p.freeRatio <= 1);
  assert.ok(['low', 'moderate', 'high'].includes(p.level));
  assert.ok(p.totalBytes > 0);
});

// --- unloadOllamaIfWarranted: point 5 this cycle - free a warm local
// model's RAM before a genuinely RAM-hungry BUILD/CPU_HEAVY task, not for
// every task (that would defeat the whole point of keeping it warm). ---

test('unloadOllamaIfWarranted: does NOT attempt any network call for a non-BUILD/CPU_HEAVY command - resolves immediately', async () => {
  const start = Date.now();
  await scheduler.unloadOllamaIfWarranted('agent_implement'); // LLM_REMOTE only
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 200, `expected a near-instant no-op for a non-heavy command, took ${elapsedMs}ms`);
});

test('unloadOllamaIfWarranted: does NOT attempt a network call for an unknown/LIGHTWEIGHT command either', async () => {
  const start = Date.now();
  await scheduler.unloadOllamaIfWarranted('totally_unknown_command');
  assert.ok(Date.now() - start < 200);
});

test('unloadOllamaIfWarranted: never throws for a BUILD-class command, even if Ollama is unreachable - best-effort only', async () => {
  // build_native maps to ['BUILD','CPU_HEAVY'] - this SHOULD attempt a
  // real call to lib/ollama-patch-adapter.js's unloadAllModels(), whose
  // own try/catch already guarantees a clean {ok:false} rather than a
  // throw on failure - this test just confirms that guarantee holds
  // through the resource-scheduler's own wrapper too, without asserting
  // on whether a real Ollama happens to be reachable on the machine
  // running this test.
  await assert.doesNotReject(scheduler.unloadOllamaIfWarranted('build_native'));
});

test('tryAcquire: two NETWORK_HEAVY-conflicting tasks cannot both hold a slot at once', () => {
  const root = tmpRoot();
  const a = scheduler.tryAcquire(root, 'agent_implement', 'task-a'); // LLM_REMOTE
  assert.equal(a.ok, true, JSON.stringify(a));
  const b = scheduler.tryAcquire(root, 'agent_implement', 'task-b'); // LLM_REMOTE - conflicts with itself
  assert.equal(b.ok, false, 'a second LLM_REMOTE task must not acquire while the first holds the slot');
  assert.equal(b.reason, 'conflicting-resource-class-in-use');
  a.release();
  const c = scheduler.tryAcquire(root, 'agent_implement', 'task-c');
  assert.equal(c.ok, true, 'after release, a new task must be able to acquire the same class');
  c.release();
});

test('tryAcquire: LIGHTWEIGHT tasks never conflict with anything, including each other', () => {
  const root = tmpRoot();
  const a = scheduler.tryAcquire(root, 'unknown_light_command_a', 'task-a');
  const b = scheduler.tryAcquire(root, 'unknown_light_command_b', 'task-b');
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  a.release();
  b.release();
});

test('tryAcquire: a real NETWORK_HEAVY download blocks a concurrent LLM_REMOTE call - the exact incident this module fixes', () => {
  const root = tmpRoot();
  const download = scheduler.tryAcquire(root, 'large_download', 'godot-templates-download');
  assert.equal(download.ok, true);
  const agentCall = scheduler.tryAcquire(root, 'agent_implement', 'viewport-fix-task');
  assert.equal(agentCall.ok, false, 'agent_implement (LLM_REMOTE) must be blocked while a NETWORK_HEAVY download holds its slot - this is the real incident reproduced as a regression test');
  download.release();
  const agentCallAfter = scheduler.tryAcquire(root, 'agent_implement', 'viewport-fix-task-retry');
  assert.equal(agentCallAfter.ok, true, 'once the download releases, the agent call must be able to proceed');
  agentCallAfter.release();
});

test('withResourceSlot: runs fn immediately when no conflict exists', async () => {
  const root = tmpRoot();
  let ran = false;
  const result = await scheduler.withResourceSlot(root, 'agent_implement', 'task-x', async () => { ran = true; return { ok: true }; });
  assert.equal(ran, true);
  assert.equal(result.ok, true);
});

test('withResourceSlot: releases its slot even when fn throws, so it never permanently deadlocks the class', async () => {
  const root = tmpRoot();
  await assert.rejects(() => scheduler.withResourceSlot(root, 'agent_implement', 'task-y', async () => { throw new Error('boom'); }));
  const after = scheduler.tryAcquire(root, 'agent_implement', 'task-z');
  assert.equal(after.ok, true, 'the slot must be released after a thrown error, not leaked');
  after.release();
});

test('withResourceSlot: gives up after maxWaitMs if the conflict never clears, reporting a clear retriable error', async () => {
  const root = tmpRoot();
  const blocker = scheduler.tryAcquire(root, 'agent_implement', 'blocker');
  assert.equal(blocker.ok, true);
  const result = await scheduler.withResourceSlot(root, 'agent_implement', 'waiter', async () => ({ ok: true }), { maxWaitMs: 3000, pollIntervalMs: 500 });
  assert.equal(result.ok, false);
  assert.equal(result.retriable, true);
  assert.match(result.error, /could not acquire/);
  blocker.release();
});
