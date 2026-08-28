#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();

function firstEnv(names) {
  for (const n of names) {
    const v = String(process.env[n] || '').trim();
    if (v) return v;
  }
  return '';
}

async function rpc(name, body = {}) {
  const url = firstEnv(['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL']);
  const key = firstEnv(['SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (!url || !key) throw new Error('Supabase server environment variables are required.');
  const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${name} ${r.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

(async () => {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dir = path.join(ROOT, 'supabase', 'migrations');
  const names = fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
  const drift = await rpc('quality_record_schema_manifest', { p_repo_sha: sha, p_migration_names: names });
  fs.writeFileSync(path.join(ROOT, 'QUALITY_SCHEMA_DRIFT_STATUS.json'), JSON.stringify(drift, null, 2) + '\n');
  console.log(JSON.stringify({ sha, migrationCount: names.length, drift }, null, 2));
  if (drift?.drift) process.exit(12);
})().catch((e) => {
  console.error(`[REPO_MANIFEST] ${e.message || e}`);
  process.exit(11);
});
