'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const bridge = require('../lib/ai-bridge');

function createTmpBridgeDir() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-bridge-test-'));
  const bridgeDir = path.join(tmpDir, '.ai', 'bridge');
  fs.mkdirSync(bridgeDir, { recursive: true });
  fs.writeFileSync(path.join(bridgeDir, 'state.json'), JSON.stringify({
    version: '1.0.0',
    last_updated: new Date().toISOString(),
    claimed_tasks: {},
    completed_tasks: []
  }, null, 2));
  fs.writeFileSync(path.join(bridgeDir, 'tasks.jsonl'), '');
  fs.writeFileSync(path.join(bridgeDir, 'results.jsonl'), '');
  return tmpDir;
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    // best effort cleanup
  }
}

test('validateRecord validates required schema fields', () => {
  const valid = {
    id: 't-1',
    timestamp: new Date().toISOString(),
    sender: 'ChatGPT',
    recipient: 'Jules',
    type: 'task',
    priority: 'P1',
    status: 'pending',
    summary: 'Test task',
    branch: null,
    commit: null,
    PR: null,
    tests: 'N/A',
    blockers: [],
    next_action: 'None'
  };

  const resValid = bridge.validateRecord(valid);
  assert.equal(resValid.ok, true);

  const invalid = { ...valid };
  delete invalid.summary;
  const resInvalid = bridge.validateRecord(invalid);
  assert.equal(resInvalid.ok, false);
  assert.match(resInvalid.error, /Missing required schema field/);
});

test('enqueueTask and claimNextTask behave idempotently and adhere to schema', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    const enqueueRes = bridge.enqueueTask({
      id: 'task-e2e-101',
      sender: 'ChatGPT',
      recipient: 'Jules',
      priority: 'P1',
      summary: 'Add bridge test capability',
      acceptance_criteria: ['Passes unit tests']
    }, tmpDir);

    assert.equal(enqueueRes.ok, true);
    assert.equal(enqueueRes.task.id, 'task-e2e-101');

    // Duplicate enqueue should fail
    const dupRes = bridge.enqueueTask({
      id: 'task-e2e-101',
      summary: 'Duplicate task'
    }, tmpDir);
    assert.equal(dupRes.ok, false);
    assert.match(dupRes.error, /already exists/);

    // Claim next task
    const claimRes = bridge.claimNextTask('Jules', tmpDir);
    assert.equal(claimRes.ok, true);
    assert.ok(claimRes.task);
    assert.equal(claimRes.task.id, 'task-e2e-101');
    assert.equal(claimRes.task.status, 'claimed');

    // Claim again when already claimed returns no pending task
    const secondClaimRes = bridge.claimNextTask('Jules', tmpDir);
    assert.equal(secondClaimRes.ok, true);
    assert.equal(secondClaimRes.task, null);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

test('postResult completes a task and updates state.json', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    bridge.enqueueTask({ id: 'task-102', summary: 'Result post test' }, tmpDir);
    bridge.claimNextTask('Jules', tmpDir);

    const postRes = bridge.postResult({
      id: 'task-102',
      sender: 'Jules',
      recipient: 'ChatGPT',
      status: 'completed',
      summary: 'Task finished successfully',
      branch: 'ai/jules/test-102',
      commit: 'abc1234',
      PR: 'https://github.com/mpaykin1/World_server/pull/99',
      tests: '100% PASS',
      blockers: [],
      next_action: 'Ready for merge'
    }, tmpDir);

    assert.equal(postRes.ok, true);
    assert.equal(postRes.result.status, 'completed');

    const state = bridge.readState(tmpDir);
    assert.ok(state.completed_tasks.includes('task-102'));
    assert.equal(state.claimed_tasks['task-102'], undefined);

    const results = bridge.readResults(tmpDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'task-102');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

test('recoverStaleTasks re-enables claimed tasks past stale threshold', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    bridge.enqueueTask({ id: 'stale-task-1', summary: 'Stale task test' }, tmpDir);
    bridge.claimNextTask('Jules', tmpDir);

    // Manually backdate claimed_at in state.json
    const state = bridge.readState(tmpDir);
    state.claimed_tasks['stale-task-1'].claimed_at = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 mins ago
    bridge.writeState(state, tmpDir);

    const recoverRes = bridge.recoverStaleTasks(tmpDir, 15 * 60 * 1000); // 15 min threshold
    assert.equal(recoverRes.ok, true);
    assert.deepEqual(recoverRes.recovered, ['stale-task-1']);

    // Should now be claimable again
    const claimRes = bridge.claimNextTask('Jules', tmpDir);
    assert.equal(claimRes.ok, true);
    assert.ok(claimRes.task);
    assert.equal(claimRes.task.id, 'stale-task-1');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

test('recoverStaleTasks moves tasks exceeding max retries to dead letter / failed', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    bridge.enqueueTask({ id: 'dead-task-1', summary: 'Dead letter task test' }, tmpDir);
    bridge.claimNextTask('Jules', tmpDir);

    // Set high retry count and old timestamp
    const state = bridge.readState(tmpDir);
    state.claimed_tasks['dead-task-1'].claimed_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    state.claimed_tasks['dead-task-1'].retry_count = 5; // exceeds max_retries (2)
    bridge.writeState(state, tmpDir);

    const recoverRes = bridge.recoverStaleTasks(tmpDir, 15 * 60 * 1000);
    assert.equal(recoverRes.ok, true);
    assert.deepEqual(recoverRes.deadLettered, ['dead-task-1']);

    const results = bridge.readResults(tmpDir);
    assert.equal(results.length, 1);
    assert.equal(results[0].id, 'dead-task-1');
    assert.equal(results[0].status, 'failed');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});
