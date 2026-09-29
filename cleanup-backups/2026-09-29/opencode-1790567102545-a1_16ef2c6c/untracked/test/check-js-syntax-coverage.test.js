'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { collectTargets, checkTargets } = require('../scripts/check-js.js');

const repoRoot = path.join(__dirname, '..');

function makeFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-check-js-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const name of ['api', 'lib', 'apps', 'shared']) {
    fs.mkdirSync(path.join(dir, name), { recursive: true });
  }
  fs.writeFileSync(path.join(dir, 'server.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'shared', 'common.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'api', 'apps.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(dir, 'lib', 'thing.js'), 'module.exports = 1;\n');
  fs.mkdirSync(path.join(dir, 'apps', 'demo'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'apps', 'demo', 'client.js'), 'export const x = 1;\n');
  return dir;
}

test('every root-level .mjs is a target of the shared syntax gate', () => {
  const rootModules = fs.readdirSync(repoRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.mjs'))
    .map(entry => entry.name);
  assert.ok(rootModules.length > 0, 'expected root-level ESM entry points to exist');
  const { modules } = collectTargets(repoRoot);
  for (const name of rootModules) {
    assert.ok(modules.includes(name), `${name} must be syntax-checked by check-js`);
  }
});

test('the gate reports every real target as valid on the current checkout', () => {
  const result = checkTargets(repoRoot);
  assert.equal(result.ok, true, result.ok ? '' : `${result.file}: ${result.output}`);
  assert.ok(result.total > 0);
});

test('a broken root-level .mjs is rejected instead of silently skipped', t => {
  const dir = makeFixture(t);
  fs.writeFileSync(path.join(dir, 'broken.mjs'), 'export const oops = (=> {\n');
  const result = checkTargets(dir);
  assert.equal(result.ok, false, 'a broken root ESM must fail the shared gate');
  assert.equal(result.file, 'broken.mjs');
  assert.ok(result.output.length > 0, 'the failure must name the underlying parser output');
});

test('the same fixture passes once the root-level .mjs is valid', t => {
  const dir = makeFixture(t);
  fs.writeFileSync(path.join(dir, 'valid.mjs'), 'export const fine = 1;\n');
  const result = checkTargets(dir);
  assert.equal(result.ok, true, result.ok ? '' : `${result.file}: ${result.output}`);
});

test('a broken root .mjs is distinguished from a broken CommonJS target', t => {
  const dir = makeFixture(t);
  fs.writeFileSync(path.join(dir, 'valid.mjs'), 'export const fine = 1;\n');
  fs.writeFileSync(path.join(dir, 'lib', 'thing.js'), 'module.exports = (=> {\n');
  const result = checkTargets(dir);
  assert.equal(result.ok, false);
  assert.equal(result.file, 'lib/thing.js',
    'pre-existing CommonJS coverage must keep reporting its own portable path');
});

test('checkTargets reports a non-zero child status instead of defaulting to success', t => {
  const dir = makeFixture(t);
  fs.writeFileSync(path.join(dir, 'valid.mjs'), 'export const fine = 1;\n');
  const result = checkTargets(dir, () => ({ status: 7, stderr: 'synthetic', stdout: '' }));
  assert.equal(result.ok, false);
  assert.equal(result.status, 7, 'the real child exit status must survive to the caller');
});
