const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
const script = fs.readFileSync(path.join(root, 'scripts', 'session-finalize.ps1'), 'utf8');

test('all agents are required to finalize sessions', () => {
  assert.match(agents, /SESSION FINALIZATION \/ DESKTOP ZERO-CLUTTER/);
  assert.match(agents, /scripts\/session-finalize\.ps1/);
});

test('finalizer preserves before removing', () => {
  assert.match(script, /git -C \$Repo commit/);
  assert.match(script, /git -C \$Repo push/);
  assert.match(script, /Save-Zip/);
  assert.match(script, /WorldServerAI\\archives/);
  assert.match(script, /Remove-Item -LiteralPath \$path/);
});
