#!/usr/bin/env node
'use strict';
// World Server selective Supabase migration preflight and BACKUP ONLY.
// No destination writes, role changes or production switch in this program.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const policy = require('../data/supabase-owner-migration-20261016.json');

const commands = new Set(['audit-source', 'audit-target', 'backup', 'verify']);
const command = process.argv[2];
if (!commands.has(command)) {
  console.error('Usage: node scripts/supabase-owner-migration.cjs audit-source|audit-target|backup|verify');
  process.exit(2);
}

function connection(which) {
  const value = process.env[which === 'source' ? 'WS_SOURCE_DATABASE_URL' : 'WS_TARGET_DATABASE_URL'];
  if (!value || !/^postgres(?:ql)?:\/\//i.test(value)) {
    throw new Error('Missing Postgres connection in WS_' + which.toUpperCase() + '_DATABASE_URL');
  }
  return value;
}
function execPg(binary, args, conn, capture = false) {
  const result = spawnSync(binary, args, {
    env: { ...process.env, PGDATABASE: conn, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15' },
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw new Error(binary + ' unavailable: ' + result.error.message);
  if (result.status !== 0) {
    // Avoid writing libpq diagnostics (which can contain endpoint details) into CI logs.
    throw new Error(binary + ' failed with exit code ' + result.status);
  }
  return capture ? result.stdout.trim() : '';
}
function query(conn, sql) {
  return execPg('psql', ['-X', '--no-psqlrc', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], conn, true);
}
function audit(conn, label) {
  const sql = "SELECT json_build_object('database_bytes',pg_database_size(current_database()),'tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('public','private')));";
  const raw = query(conn, sql);
  const data = JSON.parse(raw);
  console.log(JSON.stringify({ phase: label, ...data }, null, 2));
  return data;
}
function ensureDifferent(source, target) {
  const a = new URL(source);
  const b = new URL(target);
  if (a.hostname === b.hostname && a.username === b.username && a.pathname === b.pathname) {
    throw new Error('Source and destination appear identical; aborting');
  }
}
function outputDir() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share');
  const dir = path.join(local, 'WorldServerAI', 'archives', 'supabase-owner-migration-20261016');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}
function dump(conn, file, selective) {
  const args = [
    '--format=custom', '--no-owner', '--no-privileges',
    '--schema=public', '--schema=private', '--file=' + file
  ];
  if (!selective) args.push('--schema=auth');
  if (selective) {
    const skipped = [...policy.archive_only_data_tables, ...policy.reset_on_target_data_tables];
    for (const table of skipped) args.push('--exclude-table-data=' + table);
  }
  execPg('pg_dump', args, conn);
  const bytes = fs.statSync(file).size;
  if (!bytes) throw new Error('Empty dump: ' + file);
  console.log(JSON.stringify({ phase: selective ? 'selective_backup' : 'full_backup', file, bytes }));
}
function count(conn, table) {
  if (!/^(public|private)\.[a-z0-9_]+$/.test(table)) throw new Error('Untrusted table name');
  return Number(query(conn, 'SELECT count(*) FROM ' + table + ';'));
}
function verify(source, target) {
  ensureDifferent(source, target);
  let mismatches = 0;
  const results = [];
  for (const table of policy.priority_tables) {
    try {
      const oldCount = count(source, table);
      const newCount = count(target, table);
      const equal = oldCount === newCount;
      results.push({ table, source_count: oldCount, target_count: newCount, equal });
      if (!equal) mismatches++;
    } catch {
      results.push({ table, equal: false, error: 'Table query failed (check schema/auth/permissions)' });
      mismatches++;
    }
  }
  console.log(JSON.stringify({ phase: 'verify', results, mismatches }, null, 2));
  if (mismatches) process.exitCode = 1;
}
try {
  if (command === 'audit-source') audit(connection('source'), 'source');
  if (command === 'audit-target') audit(connection('target'), 'target');
  if (command === 'backup') {
    const source = connection('source');
    const folder = outputDir();
    const complete = path.join(folder, 'source-full-private-auth.dump');
    const selected = path.join(folder, 'source-selective.dump');
    if (fs.existsSync(complete) || fs.existsSync(selected)) {
      throw new Error('Backup already exists; refusing to overwrite evidence');
    }
    audit(source, 'source');
    dump(source, complete, false);
    dump(source, selected, true);
    console.log('BACKUP_COMPLETE; no data was written to the destination');
  }
  if (command === 'verify') verify(connection('source'), connection('target'));
} catch (error) {
  console.error('MIGRATION_NOT_READY:', error.message);
  process.exitCode = 1;
}
