'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const tails = require('../lib/tail-budget');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

test('worktree parser preserves branch and detached state', () => {
  const parsed = tails.parseWorktrees([
    'worktree C:/repo',
    'HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'branch refs/heads/master',
    '',
    'worktree C:/wt',
    'HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    'detached',
    '',
  ].join('\n'));
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].branch, 'master');
  assert.equal(parsed[1].detached, true);
});

test('pending report audit counts only latest fresh pending tasks', () => {
  const root = tempDir('tail-reports');
  const state = path.join(root, 'state');
  fs.mkdirSync(state);
  const now = Date.now();
  const rows = [
    { at: new Date(now - 60_000).toISOString(), task_id: 'a', status: 'queued' },
    { at: new Date(now - 30_000).toISOString(), task_id: 'a', status: 'done' },
    { at: new Date(now - 20_000).toISOString(), task_id: 'b', status: 'assigned' },
    { at: new Date(now - 48 * 60 * 60 * 1000).toISOString(), task_id: 'old', status: 'queued' },
  ];
  fs.writeFileSync(path.join(state, 'ai-agent-reports.jsonl'), rows.map(JSON.stringify).join('\n') + '\n');
  const pending = tails.pendingReports(root, 24, now);
  assert.deepEqual(pending.map((row) => row.task_id), ['b']);
});

test('tail budget defaults enforce five active, two dirty, three external', () => {
  assert.deepEqual(tails.policyDefaults({}), {
    maxActiveTails: 5,
    maxDirtyWorktrees: 2,
    maxPendingExternal: 3,
    pendingTtlHours: 24,
  });
});
