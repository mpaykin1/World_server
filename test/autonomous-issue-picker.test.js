'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const picker = require('../lib/autonomous-issue-picker');

function tmpRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'issue-picker-test-'));
  fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
  return dir;
}

function writeRegistry(dir, obj) {
  fs.writeFileSync(path.join(dir, 'data', 'error-prevention-registry.json'), JSON.stringify(obj));
}

// --- isSafeCandidate: only mechanical, low-risk shapes are ever picked ---

test('isSafeCandidate: accepts a real, known-safe mechanical pattern', () => {
  assert.equal(picker.isSafeCandidate({ file: 'apps/x/index.html', message: 'viewport-fit=cover missing' }), true);
});

test('isSafeCandidate: rejects anything not matching a known-safe pattern - never guesses at an unfamiliar issue shape', () => {
  assert.equal(picker.isSafeCandidate({ file: 'apps/x/index.html', message: 'SQL injection risk in query builder' }), false);
});

test('isSafeCandidate: rejects a candidate missing file or message entirely', () => {
  assert.equal(picker.isSafeCandidate({ message: 'viewport-fit=cover missing' }), false);
  assert.equal(picker.isSafeCandidate({ file: 'a.html' }), false);
  assert.equal(picker.isSafeCandidate(null), false);
});

test('isSafeCandidate: refuses a matching-message candidate whose file looks security/secret-adjacent, even if the pattern matched', () => {
  assert.equal(picker.isSafeCandidate({ file: '.env.production', message: 'viewport-fit=cover missing' }), false);
  assert.equal(picker.isSafeCandidate({ file: 'config/secrets.json', message: 'viewport-fit=cover missing' }), false);
});

// --- goalForCandidate: real, specific goal text per known-safe pattern ---

test('goalForCandidate: produces a real, specific, actionable goal for each known-safe pattern', () => {
  assert.match(picker.goalForCandidate({ file: 'a.html', message: 'viewport-fit=cover missing' }), /viewport-fit=cover/);
  assert.match(picker.goalForCandidate({ file: 'a.html', message: 'missing alt attribute' }), /alt/);
  assert.match(picker.goalForCandidate({ file: 'a.html', message: 'missing rel="noopener"' }), /noopener/);
});

test('goalForCandidate: returns null (never a fabricated goal) for an unrecognized message', () => {
  assert.equal(picker.goalForCandidate({ file: 'a.html', message: 'some totally unfamiliar issue' }), null);
});

// --- findCandidate: real registry reading, real on-disk confirmation ---

test('findCandidate: finds a real, safe candidate whose target file genuinely exists', () => {
  const dir = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'apps', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'apps', 'demo', 'index.html'), '<meta name="viewport" content="width=device-width,initial-scale=1">');
    writeRegistry(dir, { candidates: [{ id: 'c1', status: 'candidate', details: { file: 'apps/demo/index.html', message: 'viewport-fit=cover missing' } }], knownErrors: [] });
    const r = picker.findCandidate(dir);
    assert.equal(r.found, true);
    assert.equal(r.id, 'c1');
    assert.match(r.goal, /viewport-fit=cover/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('findCandidate: never picks a candidate whose target file no longer exists - stale registry evidence is not acted on', () => {
  const dir = tmpRepo();
  try {
    writeRegistry(dir, { candidates: [{ id: 'c1', status: 'candidate', details: { file: 'apps/does-not-exist/index.html', message: 'viewport-fit=cover missing' } }], knownErrors: [] });
    const r = picker.findCandidate(dir);
    assert.equal(r.found, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('findCandidate: reports honestly (found:false) when the registry has nothing safe to pick - never fabricates a task', () => {
  const dir = tmpRepo();
  try {
    writeRegistry(dir, { candidates: [{ id: 'c1', status: 'candidate', details: { file: 'apps/demo/index.html', message: 'complex architectural refactor needed' } }], knownErrors: [] });
    const r = picker.findCandidate(dir);
    assert.equal(r.found, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('findCandidate: also scans knownErrors entries still in candidate status, not just the candidates array', () => {
  const dir = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'apps', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'apps', 'demo', 'index.html'), '<img src="hero.png">');
    writeRegistry(dir, { candidates: [], knownErrors: [{ id: 'k1', status: 'candidate', details: { file: 'apps/demo/index.html', message: 'missing loading="lazy"' } }] });
    const r = picker.findCandidate(dir);
    assert.equal(r.found, true);
    assert.equal(r.id, 'k1');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- issueStillApplies / stale-candidate prevention: point 8 (new cycle)
// - a real stale candidate (already fixed by an earlier merged PR, before
// the registry's own source scan had re-run) was found live this cycle.
// findCandidate must re-check the issue against real CURRENT content, not
// just that the target file exists. ---

test('issueStillApplies: a viewport-fit=cover candidate no longer applies once the file already has it', () => {
  const applies = picker.issueStillApplies({ message: 'viewport-fit=cover missing' }, '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
  assert.equal(applies, false);
});

test('issueStillApplies: a viewport-fit=cover candidate still applies when the file genuinely lacks it', () => {
  const applies = picker.issueStillApplies({ message: 'viewport-fit=cover missing' }, '<meta name="viewport" content="width=device-width,initial-scale=1">');
  assert.equal(applies, true);
});

test('issueStillApplies: an unrecognized message with no real content check defaults to still-applies rather than guessing resolved', () => {
  const applies = picker.issueStillApplies({ message: 'some future issue shape' }, 'anything');
  assert.equal(applies, true);
});

test('findCandidate: a real stale candidate (file already fixed) is marked resolved and skipped, never handed to the agent', () => {
  const dir = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'apps', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'apps', 'demo', 'index.html'), '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">');
    writeRegistry(dir, { candidates: [{ id: 'stale1', status: 'candidate', details: { file: 'apps/demo/index.html', message: 'viewport-fit=cover missing' } }], knownErrors: [] });
    const r = picker.findCandidate(dir);
    assert.equal(r.found, false, 'must never hand an already-fixed file to the agent as if it were a live task');
    const registry = JSON.parse(fs.readFileSync(path.join(dir, 'data', 'error-prevention-registry.json'), 'utf8'));
    const entry = registry.candidates.find((e) => e.id === 'stale1');
    assert.equal(entry.status, 'resolved', 'the stale candidate must be marked resolved as real, honest bookkeeping');
    assert.ok(entry.resolvedNote, 'must leave a real note explaining why it was auto-resolved');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// --- runAutonomousIssuePicker: real orchestration, isolated worktree,
// never touches master - tested with injected fakes so this stays fast
// and deterministic (the real live path is exercised separately). ---

test('runAutonomousIssuePicker: honestly reports picked:false with no worktree created when nothing safe is found', async () => {
  const dir = tmpRepo();
  try {
    writeRegistry(dir, { candidates: [], knownErrors: [] });
    let worktreeCreated = false;
    const r = await picker.runAutonomousIssuePicker(dir, {
      createIsolatedWorktreeFn: () => { worktreeCreated = true; return { ok: true, worktreePath: '/x', branch: 'b' }; },
      implementGoalFn: async () => ({ ok: true }),
    });
    assert.equal(r.picked, false);
    assert.equal(worktreeCreated, false, 'must never create a worktree for a task it did not actually pick');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runAutonomousIssuePicker: real orchestration - picks a real candidate, creates an isolated worktree, routes through implementGoal, reports the real result', async () => {
  const dir = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'apps', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'apps', 'demo', 'index.html'), 'content');
    writeRegistry(dir, { candidates: [{ id: 'c1', status: 'candidate', details: { file: 'apps/demo/index.html', message: 'viewport-fit=cover missing' } }], knownErrors: [] });
    let implementGoalCalledWith = null;
    const r = await picker.runAutonomousIssuePicker(dir, {
      createIsolatedWorktreeFn: (root, name) => ({ ok: true, worktreePath: `/fake/${name}`, branch: `ai/agent-invoke/${name}` }),
      implementGoalFn: async (args) => { implementGoalCalledWith = args; return { ok: true, tier: 'free-local' }; },
    });
    assert.equal(r.picked, true);
    assert.equal(r.ok, true);
    assert.match(implementGoalCalledWith.goal, /viewport-fit=cover/);
    assert.equal(implementGoalCalledWith.targetWorktree, '/fake/autofix-c1');
    assert.ok(r.branch.startsWith('ai/agent-invoke/'), 'must be a real isolated branch, never master');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('runAutonomousIssuePicker: reports a real, honest failure (not a false success) when implementGoal itself fails', async () => {
  const dir = tmpRepo();
  try {
    fs.mkdirSync(path.join(dir, 'apps', 'demo'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'apps', 'demo', 'index.html'), 'content');
    writeRegistry(dir, { candidates: [{ id: 'c1', status: 'candidate', details: { file: 'apps/demo/index.html', message: 'viewport-fit=cover missing' } }], knownErrors: [] });
    const r = await picker.runAutonomousIssuePicker(dir, {
      createIsolatedWorktreeFn: (root, name) => ({ ok: true, worktreePath: `/fake/${name}`, branch: `ai/agent-invoke/${name}` }),
      implementGoalFn: async () => ({ ok: false, needsEscalation: true, error: 'all free-tier models failed' }),
    });
    assert.equal(r.picked, true);
    assert.equal(r.ok, false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
