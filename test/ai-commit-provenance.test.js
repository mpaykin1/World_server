'use strict';
// Regression tests for scripts/lib/ai-commit-provenance.cjs
// (AI COMMIT PROVENANCE rule, see AGENTS.md).
//
// Run: node --test test/ai-commit-provenance.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const {
  parseProvenanceTrailers,
  findDuplicateActiveSessions,
  auditActiveSessionProvenance,
} = require('../scripts/lib/ai-commit-provenance.cjs');

test('parseProvenanceTrailers reads all mandatory fields from AI-Session commits', () => {
  const message = [
    'feat(x): do a thing',
    '',
    'AI-Agent: Claude-Code',
    'AI-Session: session-abc-123',
    'Worktree: C:/repo/World_server',
    'Branch: ai/claude/x',
    'Ownership: housekeeping/CAS',
  ].join('\n');
  const t = parseProvenanceTrailers(message);
  assert.equal(t.aiAgent, 'Claude-Code');
  assert.equal(t.aiSession, 'session-abc-123');
  assert.equal(t.usedLegacyField, false);
  assert.equal(t.worktree, 'C:/repo/World_server');
  assert.equal(t.branch, 'ai/claude/x');
  assert.equal(t.ownership, 'housekeeping/CAS');
});

test('parseProvenanceTrailers falls back to legacy Claude-Session and flags it', () => {
  const message = 'fix: old-style commit\n\nClaude-Session: https://claude.ai/code/session_ABC\n';
  const t = parseProvenanceTrailers(message);
  assert.equal(t.aiSession, 'https://claude.ai/code/session_ABC');
  assert.equal(t.usedLegacyField, true);
  assert.equal(t.aiAgent, null);
});

test('parseProvenanceTrailers prefers AI-Session over a legacy Claude-Session if both present', () => {
  const message = 'chore: migrate trailer\n\nAI-Session: new-id\nClaude-Session: old-id\n';
  const t = parseProvenanceTrailers(message);
  assert.equal(t.aiSession, 'new-id');
  assert.equal(t.usedLegacyField, false);
});

test('parseProvenanceTrailers returns nulls when no trailers present', () => {
  const t = parseProvenanceTrailers('plain commit with no trailers');
  assert.deepEqual(t, {
    aiAgent: null,
    aiSession: null,
    usedLegacyField: false,
    worktree: null,
    branch: null,
    ownership: null,
  });
});

test('findDuplicateActiveSessions flags a session id shared across two branches', () => {
  const records = [
    { branch: 'ai/opencode/a', sessionId: 'shared-id', sha: 'aaa' },
    { branch: 'ai/opencode/b', sessionId: 'shared-id', sha: 'bbb' },
    { branch: 'ai/opencode/c', sessionId: 'unique-id', sha: 'ccc' },
  ];
  const collisions = findDuplicateActiveSessions(records);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].sessionId, 'shared-id');
  assert.deepEqual(
    new Set(collisions[0].records.map((r) => r.branch)),
    new Set(['ai/opencode/a', 'ai/opencode/b'])
  );
});

test('findDuplicateActiveSessions does not flag the same session id repeated on one branch', () => {
  const records = [
    { branch: 'ai/opencode/a', sessionId: 'same-branch-id', sha: 'aaa' },
    { branch: 'ai/opencode/a', sessionId: 'same-branch-id', sha: 'bbb' },
  ];
  assert.deepEqual(findDuplicateActiveSessions(records), []);
});

test('findDuplicateActiveSessions ignores records with no sessionId', () => {
  const records = [
    { branch: 'ai/opencode/a', sessionId: null, sha: 'aaa' },
    { branch: 'ai/opencode/b', sessionId: undefined, sha: 'bbb' },
  ];
  assert.deepEqual(findDuplicateActiveSessions(records), []);
});

// --- Integration: auditActiveSessionProvenance against a real fixture repo ---

function sh(cwd, cmd, args) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout;
}

function mkRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-provenance-fixture-'));
  sh(dir, 'git', ['init', '-q', '-b', 'master']);
  sh(dir, 'git', ['config', 'user.email', 'test@test.local']);
  sh(dir, 'git', ['config', 'user.name', 'test']);
  fs.writeFileSync(path.join(dir, 'README.md'), 'root\n');
  sh(dir, 'git', ['add', '.']);
  sh(dir, 'git', ['commit', '-q', '-m', 'init']);
  return dir;
}

function commitOnBranch(dir, branch, file, message) {
  sh(dir, 'git', ['checkout', '-q', '-b', branch, 'master']);
  fs.writeFileSync(path.join(dir, file), `${branch}\n`);
  sh(dir, 'git', ['add', '.']);
  sh(dir, 'git', ['commit', '-q', '-m', message]);
}

test('auditActiveSessionProvenance WARNs (reports a collision) when two active branches share an AI-Session id', () => {
  const dir = mkRepo();
  commitOnBranch(dir, 'ai/opencode/session-a', 'a.txt', 'feat: a\n\nAI-Session: SAME-ID\nBranch: ai/opencode/session-a\n');
  commitOnBranch(dir, 'ai/opencode/session-b', 'b.txt', 'feat: b\n\nAI-Session: SAME-ID\nBranch: ai/opencode/session-b\n');

  const { collisions } = auditActiveSessionProvenance({ cwd: dir, activeWindowMs: 24 * 60 * 60 * 1000 });
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].sessionId, 'SAME-ID');
  const branches = new Set(collisions[0].records.map((r) => r.branch));
  assert.ok(branches.has('ai/opencode/session-a'));
  assert.ok(branches.has('ai/opencode/session-b'));
});

test('auditActiveSessionProvenance reports no collision when active branches use distinct session ids', () => {
  const dir = mkRepo();
  commitOnBranch(dir, 'ai/opencode/session-x', 'x.txt', 'feat: x\n\nAI-Session: id-x\n');
  commitOnBranch(dir, 'ai/opencode/session-y', 'y.txt', 'feat: y\n\nAI-Session: id-y\n');

  const { collisions } = auditActiveSessionProvenance({ cwd: dir, activeWindowMs: 24 * 60 * 60 * 1000 });
  assert.deepEqual(collisions, []);
});

test('auditActiveSessionProvenance ignores branches outside the active window', () => {
  const dir = mkRepo();
  commitOnBranch(dir, 'ai/opencode/stale', 'stale.txt', 'feat: stale\n\nAI-Session: SAME-ID\n');
  commitOnBranch(dir, 'ai/opencode/fresh', 'fresh.txt', 'feat: fresh\n\nAI-Session: SAME-ID\n');

  // A window of 0ms means "committed strictly after now" — nothing this fresh exists,
  // so both branches fall outside the active window and no collision is reported.
  const { collisions, records } = auditActiveSessionProvenance({ cwd: dir, activeWindowMs: 0 });
  assert.deepEqual(records, []);
  assert.deepEqual(collisions, []);
});
