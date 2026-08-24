#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const mode = process.argv[2] || '--check-offline';
const MIG_DIR = path.join(ROOT, 'supabase', 'migrations');
const LEGACY_ROOT = path.join(ROOT, 'supabase', 'migrations_legacy');
const ROLLBACK_DIR = path.join(ROOT, 'supabase', 'migration_rollbacks');
const MANIFEST_FILE = path.join(ROOT, 'data', 'supabase-migration-manifest.json');

function firstEnv(names) {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function localNames() {
  if (!fs.existsSync(MIG_DIR)) return [];
  return fs.readdirSync(MIG_DIR).filter((x) => x.endsWith('.sql')).sort();
}

function diff(expected, actual) {
  const a = new Set(actual);
  const e = new Set(expected);
  return {
    missing: expected.filter((x) => !a.has(x)),
    extra: actual.filter((x) => !e.has(x)),
  };
}

async function rpc(name, body = {}) {
  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY are required for live sync. Use connected Supabase tooling instead of exposing a key.');
  }
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function serverNameDigest(names) {
  return sha256(names.join('\n'));
}

function writeCanonical(exported) {
  const migrations = Array.isArray(exported?.migrations) ? exported.migrations : [];
  if (!migrations.length) throw new Error('Server export contains no migrations.');

  const expected = migrations
    .map((m) => `${m.version}_${m.name}.sql`)
    .sort();

  const oldNames = localNames();
  const d = diff(expected, oldNames);

  if (d.missing.length || d.extra.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(LEGACY_ROOT, stamp);
    fs.mkdirSync(backup, { recursive: true });
    for (const name of oldNames) {
      fs.copyFileSync(path.join(MIG_DIR, name), path.join(backup, name));
    }
  }

  fs.mkdirSync(MIG_DIR, { recursive: true });
  for (const name of localNames()) fs.unlinkSync(path.join(MIG_DIR, name));
  fs.mkdirSync(ROLLBACK_DIR, { recursive: true });

  const fileMeta = [];
  for (const m of migrations) {
    const name = `${m.version}_${m.name}.sql`;
    const statements = Array.isArray(m.statements) ? m.statements : [];
    const content = statements.join('\n\n-- statement boundary\n\n').trimEnd() + '\n';
    fs.writeFileSync(path.join(MIG_DIR, name), content, 'utf8');

    const rollback = Array.isArray(m.rollback) ? m.rollback : [];
    if (rollback.length) {
      fs.writeFileSync(
        path.join(ROLLBACK_DIR, `${name}.rollback.sql`),
        rollback.join('\n\n-- rollback statement boundary\n\n').trimEnd() + '\n',
        'utf8',
      );
    }
    fileMeta.push({ name, sha256: sha256(content) });
  }

  const names = fileMeta.map((x) => x.name).sort();
  const nameDigest = serverNameDigest(names);
  if (exported.digest && exported.digest !== nameDigest) {
    throw new Error(`Server migration-name digest mismatch: server=${exported.digest} local=${nameDigest}`);
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'public.quality_export_migration_history',
    count: names.length,
    latest: names[names.length - 1] || null,
    serverNameDigest: exported.digest || nameDigest,
    localNameDigest: nameDigest,
    contentDigest: sha256(fileMeta.map((x) => `${x.name}:${x.sha256}`).join('\n')),
    names,
    files: fileMeta,
  };

  fs.mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + '\n');
  return manifest;
}

function checkOffline() {
  if (!fs.existsSync(MANIFEST_FILE)) throw new Error(`Missing ${path.relative(ROOT, MANIFEST_FILE)}`);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_FILE, 'utf8'));
  const expected = Array.isArray(manifest.names) ? [...manifest.names].sort() : [];
  const actual = localNames();
  const d = diff(expected, actual);
  const digest = serverNameDigest(actual);
  const ok = !d.missing.length && !d.extra.length && digest === manifest.localNameDigest;
  console.log(JSON.stringify({ mode: 'offline', ok, count: actual.length, missing: d.missing, extra: d.extra, digest }, null, 2));
  if (!ok) process.exit(12);
}

async function checkLive() {
  const exported = await rpc('quality_export_migration_history');
  const expected = (exported.migrations || []).map((m) => `${m.version}_${m.name}.sql`).sort();
  const actual = localNames();
  const d = diff(expected, actual);
  const digest = serverNameDigest(actual);
  const ok = !d.missing.length && !d.extra.length && digest === exported.digest;
  console.log(JSON.stringify({ mode: 'live', ok, serverCount: exported.count, localCount: actual.length, missing: d.missing, extra: d.extra, serverDigest: exported.digest, localDigest: digest }, null, 2));
  if (!ok) process.exit(13);
}

async function main() {
  if (mode === '--check-offline') return checkOffline();
  if (mode === '--check-live') return checkLive();
  if (mode === '--apply') {
    const exported = await rpc('quality_export_migration_history');
    const manifest = writeCanonical(exported);
    console.log(JSON.stringify({ mode: 'apply', ok: true, count: manifest.count, latest: manifest.latest, digest: manifest.serverNameDigest }, null, 2));
    return;
  }
  throw new Error(`Unknown mode ${mode}. Use --apply, --check-live, or --check-offline.`);
}

main().catch((e) => {
  console.error(`[SUPABASE_MIGRATION_SYNC] ${e.message || e}`);
  process.exit(11);
});
