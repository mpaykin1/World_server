#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = process.cwd();
const dir = path.join(root, 'supabase', 'migrations');
const manifestPath = path.join(root, 'data', 'supabase-migration-manifest.json');

if (!fs.existsSync(manifestPath)) {
  console.log(JSON.stringify({ ok: true, baseline: 'not-materialized-yet' }, null, 2));
  process.exit(0);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const names = fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort();
const digest = crypto.createHash('sha256').update(names.join('\n')).digest('hex');

const expected = Array.isArray(manifest.names) ? [...manifest.names].sort() : [];
const sameNames = JSON.stringify(names) === JSON.stringify(expected);
const ok = sameNames && digest === manifest.localNameDigest;

console.log(JSON.stringify({
  ok,
  count: names.length,
  expectedCount: expected.length,
  digest,
  expectedDigest: manifest.localNameDigest,
}, null, 2));

if (!ok) process.exit(12);
