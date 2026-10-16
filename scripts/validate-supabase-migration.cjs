#!/usr/bin/env node
'use strict';
// Self-contained LOCAL_FIXTURE validation. Never consumes live database DSNs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const bin = process.env.WS_PG_BIN_DIR;
const core = ['env', 'auth', 'game-rules', 'voxel-rules', 'world-catalog', 'project-context-api',
  'server-entrypoint', 'architecture-limits', 'golden-physics', 'voxel-offline-resilience', 'dependency-security-lock'];

function main() {
  if (process.argv.slice(2).some(arg => arg !== '--with-core')) throw new Error('Use --with-core or no options');
  if (!bin || !path.isAbsolute(bin)) throw new Error('Set WS_PG_BIN_DIR to the verified PostgreSQL 17 bin directory');
  const env = { ...process.env, PATH: bin + path.delimiter + process.env.PATH, WS_MIGRATION_SCOPE: 'LOCAL_FIXTURE' };
  for (const name of Object.keys(env)) {
    if (/^PG/.test(name) || /^(WS_(?:SOURCE|TARGET)_DATABASE_URL|(?:WS_TARGET_)?SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY|ACCESS_TOKEN))$/.test(name)) delete env[name];
  }
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-migration-validation-'));
  const data = path.join(folder, 'data'), socket = path.join(folder, 'socket');
  fs.chmodSync(folder, 0o700);
  fs.mkdirSync(socket, { mode: 0o700 });
  let started = false;
  function pg(binary, args) {
    const result = spawnSync(path.join(bin, binary), args, { env, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) throw new Error('Local fixture ' + binary + ' failed; no live databases were used');
    return result.stdout;
  }
  try {
    if (!/\b17\./.test(pg('postgres', ['--version']))) throw new Error('PostgreSQL 17 is required');
    pg('initdb', ['-D', data, '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale']);
    pg('pg_ctl', ['-D', data, '-l', path.join(folder, 'postgres.log'), '-o',
      '-h 127.0.0.1 -p 55418 -k ' + socket + ' -c shared_buffers=16MB -c max_connections=16', '-w', 'start']);
    started = true;
    const tests = fs.readdirSync(path.join(root, 'test')).filter(name => /^supabase-(migration|owner).*\.test\.js$/.test(name))
      .sort().map(name => path.join('test', name));
    if (process.argv.includes('--with-core')) tests.push(...core.map(name => 'test/' + name + '.test.js'));
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], {
      cwd: root, env: { ...env, WS_INVENTORY_FIXTURE_SOCKET: socket }, stdio: 'inherit', timeout: 180000
    });
    return result.status ?? 1;
  } finally {
    if (started) pg('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
if (require.main === module) {
  try { process.exitCode = main(); }
  catch (error) { console.error('LOCAL_VALIDATION_BLOCKED: ' + error.message); process.exitCode = 1; }
}
