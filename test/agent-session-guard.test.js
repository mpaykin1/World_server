'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const guard = require('../lib/agent-session-guard');

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
}

test('policy requires every current and future agent to inherit session hygiene', () => {
  const p = guard.loadPolicy();
  assert.equal(p.requiredForEveryAgent, true);
  assert.equal(p.inheritForFutureAgents, true);
  assert.ok(!/[\\/]Desktop[\\/]/i.test(p.worktreesRoot));
  assert.ok(!/[\\/]Desktop[\\/]/i.test(p.scratchRoot));
});

test('desktop audit flags only known AI clutter patterns and leaves canonical/user items alone', () => {
  const desktop = tempDir('fake-desktop');
  fs.mkdirSync(path.join(desktop, 'World_server'));
  fs.mkdirSync(path.join(desktop, 'World_server_backup'));
  fs.writeFileSync(path.join(desktop, 'family-photo.jpg'), 'user data');
  const r = guard.auditDesktop(desktop);
  assert.equal(r.ok, false);
  assert.equal(r.violations.length, 1);
  assert.match(r.violations[0], /World_server_backup$/);
  assert.ok(fs.existsSync(path.join(desktop, 'family-photo.jpg')));
});

test('scratch cleanup deletes only expired files with owned prefixes', () => {
  const scratchRoot = tempDir('agent-scratch');
  const oldOwned = path.join(scratchRoot, 'agent-old.txt');
  const freshOwned = path.join(scratchRoot, 'health-probe-fresh.txt');
  const userFile = path.join(scratchRoot, 'notes.txt');
  fs.writeFileSync(oldOwned, 'old');
  fs.writeFileSync(freshOwned, 'fresh');
  fs.writeFileSync(userFile, 'keep');
  const old = new Date(Date.now() - 48 * 60 * 60 * 1000);
  fs.utimesSync(oldOwned, old, old);
  const r = guard.cleanupOwnedScratch({ scratchRoot, scratchTtlHours: 24 });
  assert.equal(fs.existsSync(oldOwned), false);
  assert.equal(fs.existsSync(freshOwned), true);
  assert.equal(fs.existsSync(userFile), true);
  assert.equal(r.removed.length, 1);
});

test('coverage is inherited automatically by an arbitrary future agent id', () => {
  const matrix = guard.coverageFor(['codex', 'future-agent-v99']);
  const future = matrix.find((x) => x.agentId === 'future-agent-v99');
  assert.deepEqual(future, { agentId: 'future-agent-v99', preflight: true, postflight: true, inherited: true });
});