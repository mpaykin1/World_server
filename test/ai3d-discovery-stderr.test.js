'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('AI3D discovery does not leak expected where.exe misses to stderr', () => {
  const script = [
    "const { discoverEngines } = require('./lib/ai3d-discovery');",
    "discoverEngines({ external3d: 'Z:\\\\__world_server_missing_ai3d__', externalMine: 'Z:\\\\__world_server_missing_mine__' });"
  ].join(' ');
  const result = spawnSync(process.execPath, ['-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, BLENDER_BIN: '__world_server_missing_blender__' }
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, '', `expected silent capability probing, got stderr: ${result.stderr}`);
});
