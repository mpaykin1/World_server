'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  REQUIRED_FIELDS,
  ensureBridgeDir,
  validateRecord,
  normalizeRecord,
  readJsonl,
  appendJsonl,
  readState,
  writeState,
  getBridgeStatusSummary,
  parseCommentTask,
  enqueueTask,
  appendResult,
  recoverStaleTasks,
  claimNextTask,
  completeTask
} = require('../lib/ai-bridge');

function createTmpBridgeDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-bridge-test-'));
}

function cleanupTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

test('validateRecord checks all 14 mandatory fields', () => {
  const invalidRecord = {
    id: 'task_1',
    timestamp: new Date().toISOString(),
    sender: 'ChatGPT'
  };

  const check1 = validateRecord(invalidRecord);
  assert.equal(check1.ok, false);
  assert.match(check1.error, /Missing mandatory fields/);

  const validRecord = normalizeRecord({
    id: 'task_1',
    summary: 'Test task',
    blockers: []
  });

  const check2 = validateRecord(validRecord);
  assert.equal(check2.ok, true);
  assert.equal(REQUIRED_FIELDS.length, 14); // Exactly 14 mandatory fields
});

test('enqueueTask and idempotency', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    ensureBridgeDir(tmpDir);

    const taskData = {
      id: 'task_unique_100',
      sender: 'ChatGPT',
      recipient: 'Jules',
      summary: 'Build bridge feature'
    };

    const res1 = enqueueTask(tmpDir, taskData);
    assert.equal(res1.ok, true);
    assert.equal(res1.duplicated, false);

    // Duplicate enqueue attempt
    const res2 = enqueueTask(tmpDir, taskData);
    assert.equal(res2.ok, true);
    assert.equal(res2.duplicated, true);

    const tasks = readJsonl(path.join(tmpDir, 'tasks.jsonl'));
    assert.equal(tasks.length, 1);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

test('claimNextTask, lease management, and completeTask', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    ensureBridgeDir(tmpDir);

    enqueueTask(tmpDir, {
      id: 'task_claim_1',
      sender: 'ChatGPT',
      recipient: 'Jules',
      summary: 'Task 1'
    });

    enqueueTask(tmpDir, {
      id: 'task_claim_2',
      sender: 'ChatGPT',
      recipient: 'Jules',
      summary: 'Task 2'
    });

    const claim1 = claimNextTask(tmpDir, 'JulesWorker');
    assert.equal(claim1.ok, true);
    assert.equal(claim1.task.id, 'task_claim_1');

    const state1 = readState(tmpDir);
    assert.ok(state1.activeLeases['task_claim_1']);
    assert.equal(state1.activeLeases['task_claim_1'].workerId, 'JulesWorker');

    // Completing task_claim_1 releases lease and appends result
    const compRes = completeTask(tmpDir, 'task_claim_1', {
      sender: 'JulesWorker',
      summary: 'Finished Task 1',
      branch: 'ai/jules/test',
      commit: 'abc1234',
      PR: 'https://github.com/mpaykin1/World_server/pull/1'
    });

    assert.equal(compRes.ok, true);

    const state2 = readState(tmpDir);
    assert.equal(state2.activeLeases['task_claim_1'], undefined);

    // Claiming next task now gets task_claim_2
    const claim2 = claimNextTask(tmpDir, 'JulesWorker');
    assert.equal(claim2.ok, true);
    assert.equal(claim2.task.id, 'task_claim_2');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

test('recoverStaleTasks automatically reclaims abandoned claimed tasks', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    ensureBridgeDir(tmpDir);

    enqueueTask(tmpDir, {
      id: 'task_stale_1',
      sender: 'ChatGPT',
      recipient: 'Jules',
      summary: 'Stale Task'
    });

    const state = readState(tmpDir);
    state.staleThresholdMs = 1000; // 1 second
    state.activeLeases['task_stale_1'] = {
      workerId: 'DeadWorker',
      claimedAt: new Date(Date.now() - 5000).toISOString() // 5 seconds ago
    };
    writeState(tmpDir, state);

    const reclaimed = recoverStaleTasks(tmpDir);
    assert.deepEqual(reclaimed, ['task_stale_1']);

    const newState = readState(tmpDir);
    assert.equal(newState.activeLeases['task_stale_1'], undefined);

    const results = readJsonl(path.join(tmpDir, 'results.jsonl'));
    const reclaimEntry = results.find((r) => r.type === 'reclaim');
    assert.ok(reclaimEntry);
    assert.equal(reclaimEntry.status, 'stale_reclaimed');
  } finally {
    cleanupTmpDir(tmpDir);
  }
});

test('parseCommentTask extracts structured task from comment body', () => {
  const commentText = `[AI-BRIDGE TASK]
task_id: task_comment_777
priority: high
task: Implement feature X with tests.
acceptance_criteria: All unit tests pass.`;

  const parsed = parseCommentTask(commentText, 12345);
  assert.equal(parsed.taskId, 'task_comment_777');
  assert.equal(parsed.priority, 'high');
  assert.equal(parsed.task, 'Implement feature X with tests.');
  assert.equal(parsed.acceptanceCriteria, 'All unit tests pass.');
});

test('getBridgeStatusSummary returns valid structure', () => {
  const tmpDir = createTmpBridgeDir();
  try {
    ensureBridgeDir(tmpDir);
    const summary = getBridgeStatusSummary(tmpDir);
    assert.equal(summary.healthy, true);
    assert.equal(summary.taskCount, 0);
    assert.equal(summary.resultCount, 0);
  } finally {
    cleanupTmpDir(tmpDir);
  }
});
