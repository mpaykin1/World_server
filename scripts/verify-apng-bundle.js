'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const manifestPath = path.join(root, 'APNG_BUNDLE_SHA256.json');
if (!fs.existsSync(manifestPath)) throw new Error('APNG_BUNDLE_HASH_MANIFEST_MISSING');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!manifest || manifest.algorithm !== 'sha256' || !manifest.files || typeof manifest.files !== 'object') throw new Error('APNG_BUNDLE_HASH_MANIFEST_INVALID');
let checked = 0;
for (const [rel, expected] of Object.entries(manifest.files)) {
  const full = path.resolve(root, rel);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`APNG_BUNDLE_HASH_PATH_UNSAFE:${rel}`);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error(`APNG_BUNDLE_FILE_MISSING:${rel}`);
  const actual = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  if (actual !== expected) throw new Error(`APNG_BUNDLE_HASH_MISMATCH:${rel}`);
  checked += 1;
}
console.log(`[APNG bundle] integrity PASS files=${checked}`);
