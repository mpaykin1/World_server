const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  assertSafeOutput,
  classifyOutput,
  scanDesktopDelta,
} = require('../scripts/workspace-hygiene');

const home = path.resolve('C:/Users/tester');
const desktop = path.join(home, 'Desktop');
const opts = { home, desktops: [desktop] };

test('blocks Desktop and descendants', () => {
  assert.equal(classifyOutput(desktop, opts).forbidden, true);
  assert.equal(classifyOutput(path.join(desktop, 'shot.png'), opts).forbidden, true);
  assert.throws(() => assertSafeOutput(path.join(desktop, 'shot.png'), opts), /WORKSPACE_HYGIENE_BLOCKED/);
});

test('blocks home root but permits repo-local output', () => {
  assert.equal(classifyOutput(home, opts).forbidden, true);
  const repoRoot = path.join(home, 'Desktop', 'World_server');
  const repoArtifact = path.join(repoRoot, 'artifacts', 'x.png');
  const offDesktopRepo = path.join(home, 'worktrees', 'World_server', 'artifacts', 'x.png');
  assert.equal(classifyOutput(repoArtifact, { ...opts, approvedRoots: [repoRoot] }).forbidden, false);
  assert.equal(classifyOutput(offDesktopRepo, opts).forbidden, false);
});

test('explicit user destination is the only override', () => {
  assert.equal(assertSafeOutput(desktop, { ...opts, explicitUserDestination: true }), desktop);
});

test('desktop delta reports only newly created names', () => {
  assert.deepEqual(scanDesktopDelta(['World_server', 'notes.txt'], ['World_server', 'notes.txt', 'World_server_tmp']), ['World_server_tmp']);
});
