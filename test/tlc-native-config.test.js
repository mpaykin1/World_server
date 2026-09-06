'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(name) {
  const p = path.join(root, 'specs', name);
  assert.ok(fs.existsSync(p), `${name} must exist for native TLC`);
  return fs.readFileSync(p, 'utf8');
}

test('DurableJobQueue TLC config binds constant and invariants', () => {
  const s = read('DurableJobQueue.cfg');
  assert.match(s, /CONSTANT MaxAttempts = 3/);
  for (const inv of ['TypeOK','TerminalNoOwner','LeaseHasOwner','AttemptsBounded']) assert.match(s, new RegExp(`INVARIANT ${inv}`));
});

test('ControlPlane TLC config checks dependency and promotion safety', () => {
  const s = read('ControlPlane.cfg');
  for (const inv of ['TypeOK','DependencyOrder','SafePromotion']) assert.match(s, new RegExp(`INVARIANT ${inv}`));
});