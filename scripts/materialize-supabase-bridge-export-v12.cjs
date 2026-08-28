#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const input = process.argv[2] || 'QUALITY_BRIDGE_MIGRATIONS.json';
const root = process.cwd();
const migrationsDir = path.join(root, 'supabase', 'migrations');
const rollbacksDir = path.join(root, 'supabase', 'migration_rollbacks');
const manifestPath = path.join(root, 'data', 'supabase-migration-manifest.json');

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function normalizeStatement(value) {
  const s = String(value || '').trimEnd();
  if (!s) return '';
  return s.endsWith(';') ? s : `${s};`;
}

function expectedName(m) {
  if (!m?.version || !m?.name) throw new Error('migration missing version/name');
  return `${m.version}_${m.name}.sql`;
}

const response = JSON.parse(fs.readFileSync(input, 'utf8'));
if (response.ok !== true || !response.data) throw new Error('Invalid bridge export envelope');

const exported = response.data;
const migrations = Array.isArray(exported.migrations) ? exported.migrations : [];
if (!migrations.length) throw new Error('Bridge export has no migrations');

fs.mkdirSync(migrationsDir, { recursive: true });
fs.mkdirSync(rollbacksDir, { recursive: true });

for (const name of fs.readdirSync(migrationsDir)) {
  if (name.endsWith('.sql')) fs.unlinkSync(path.join(migrationsDir, name));
}

for (const name of fs.readdirSync(rollbacksDir)) {
  if (name.endsWith('.sql')) fs.unlinkSync(path.join(rollbacksDir, name));
}

const fileMeta = [];

for (const migration of migrations) {
  const name = expectedName(migration);
  const statements = Array.isArray(migration.statements) ? migration.statements : [];
  const sql = statements
    .map(normalizeStatement)
    .filter(Boolean)
    .join('\n\n-- statement boundary\n\n') + '\n';

  fs.writeFileSync(path.join(migrationsDir, name), sql, 'utf8');
  fileMeta.push({ name, sha256: sha256(sql) });

  const rollback = Array.isArray(migration.rollback) ? migration.rollback : [];
  if (rollback.length) {
    const rollbackSql = rollback
      .map(normalizeStatement)
      .filter(Boolean)
      .join('\n\n-- rollback statement boundary\n\n') + '\n';
    fs.writeFileSync(path.join(rollbacksDir, `${name}.rollback.sql`), rollbackSql, 'utf8');
  }
}

const names = fileMeta.map((x) => x.name).sort();
const nameDigest = sha256(names.join('\n'));

if (exported.digest && nameDigest !== exported.digest) {
  throw new Error(`Migration-name digest mismatch: server=${exported.digest} local=${nameDigest}`);
}

const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'quality-github-bridge/migration-export',
  count: names.length,
  latest: names[names.length - 1],
  serverNameDigest: exported.digest || nameDigest,
  localNameDigest: nameDigest,
  contentDigest: sha256(fileMeta.map((x) => `${x.name}:${x.sha256}`).join('\n')),
  names,
  files: fileMeta,
};

fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: true,
  count: names.length,
  latest: manifest.latest,
  nameDigest,
  contentDigest: manifest.contentDigest,
}, null, 2));
