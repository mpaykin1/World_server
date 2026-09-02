'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os');
const { buildReportEntry, appendReport } = require('../scripts/openhuman-subtask.cjs');

function tmpLog() { return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'subtask-report-')), 'reports.jsonl'); }

test('buildReportEntry uses the SAME schema fields other AI agents already write to state/ai-agent-reports.jsonl', () => {
  const entry = buildReportEntry({ result: 'PASS', model: 'qwen2.5:3b-instruct' }, 'filesystem-read', { callerAgent: 'claude-orchestrator' });
  for (const field of ['at', 'agent', 'task_id', 'status', 'progress', 'branch', 'worktree', 'commit', 'pr', 'tests', 'blockers', 'merge_safe', 'next_action', 'findings', 'reusable_improvements']) {
    assert.ok(field in entry, `missing field: ${field}`);
  }
  assert.equal(entry.agent, 'openhuman-anythingllm');
  assert.equal(entry.status, 'done');
  assert.equal(entry.progress, 100);
  assert.deepEqual(entry.blockers, []);
});

test('a QUEUED result is reported as status=queued with a deferred_by_resource_gate blocker, not a failure', () => {
  const entry = buildReportEntry({ result: 'QUEUED', resourceGate: { reason: 'cpu=95% over 70%' } }, 'filesystem-read', {});
  assert.equal(entry.status, 'queued');
  assert.equal(entry.blockers[0].status, 'deferred_by_resource_gate');
  assert.match(entry.blockers[0].reason, /cpu=95%/);
});

test('a FAIL result is reported as status=failed with a needs_review blocker carrying the real reason', () => {
  const entry = buildReportEntry({ result: 'FAIL', attempts: [{ reason: 'error_fetch failed' }] }, 'filesystem-read', {});
  assert.equal(entry.status, 'failed');
  assert.equal(entry.blockers[0].status, 'needs_review');
  assert.equal(entry.blockers[0].reason, 'error_fetch failed');
});

test('appendReport actually writes a real, parseable JSONL line', () => {
  const logPath = tmpLog();
  const entry = buildReportEntry({ result: 'PASS' }, 'filesystem-read', {});
  const ok = appendReport(entry, logPath);
  assert.equal(ok, true);
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.agent, 'openhuman-anythingllm');
});

test('appendReport fails gracefully (returns false, does not throw) if the log path is unwritable', () => {
  // A path with a null byte is invalid on every platform - a controlled way to
  // force a write failure without relying on OS-specific permission setup.
  const ok = appendReport({ x: 1 }, 'C:\\this\\path\\has\\a\\null\x00byte\\reports.jsonl');
  assert.equal(ok, false);
});
