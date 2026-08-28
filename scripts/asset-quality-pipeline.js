#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = process.cwd();
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/asset-quality-policy.json'), 'utf8'));
const roots = (policy.roots || []).map(r => path.join(ROOT, r));
const files = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile()) files.push(full);
  }
}
for (const dir of roots) walk(dir);

function rel(file) { return path.relative(ROOT, file).replaceAll('\\', '/'); }
function ext(file) { return path.extname(file).toLowerCase(); }
function sha(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    let read = 0, pos = 0;
    while ((read = fs.readSync(fd, buf, 0, buf.length, pos)) > 0) {
      h.update(buf.subarray(0, read));
      pos += read;
    }
  } finally { fs.closeSync(fd); }
  return h.digest('hex');
}

const assetExt = new Set([...(policy.supported3d || []), ...(policy.textures || []), ...(policy.audio || []), '.wasm', '.pck']);
const assets = files.filter(f => assetExt.has(ext(f)));
const byHash = new Map();
const entries = [];
let totalBytes = 0;

for (const file of assets) {
  const stat = fs.statSync(file);
  totalBytes += stat.size;
  const e = ext(file);
  const hash = sha(file);
  if (!byHash.has(hash)) byHash.set(hash, []);
  byHash.get(hash).push(file);
  const kind = (policy.supported3d || []).includes(e) ? '3d' : (policy.textures || []).includes(e) ? 'texture' : (policy.audio || []).includes(e) ? 'audio' : 'runtime';
  const opportunities = [];
  if (kind === 'texture' && stat.size >= policy.textureHeavyBytes && !(policy.runtimeCompressedPreferred || []).includes(e)) opportunities.push('runtime-texture-compression-candidate');
  if (kind === '3d' && stat.size >= policy.heavyAssetBytes) opportunities.push('meshopt-or-streaming-candidate');
  if (stat.size >= policy.veryHeavyAssetBytes) opportunities.push('very-heavy-runtime-asset');
  entries.push({ file: rel(file), kind, ext: e, bytes: stat.size, sha256: hash, opportunities });
}

const duplicates = [];
for (const [hash, group] of byHash.entries()) {
  if (group.length < 2) continue;
  const size = fs.statSync(group[0]).size;
  duplicates.push({ sha256: hash, bytesEach: size, redundantBytes: size * (group.length - 1), files: group.map(rel) });
}

const opportunities = entries.filter(x => x.opportunities.length).sort((a, b) => b.bytes - a.bytes);

// Generate a non-destructive delivery manifest used by the PWA idle warmer.
const delivery = { schemaVersion: '1.0.0', perApp: {}, shared: [] };
for (const item of entries) {
  if (item.bytes > 8 * 1024 * 1024) continue;
  const url = '/' + item.file.replace(/^\/+/, '');
  const record = { url, bytes: item.bytes, kind: item.kind, sha256: item.sha256 };
  const m = item.file.match(/^apps\/([^/]+)\//);
  if (m) {
    (delivery.perApp[m[1]] ||= []).push(record);
  } else if (item.file.startsWith('shared/')) {
    delivery.shared.push(record);
  }
}
for (const list of [...Object.values(delivery.perApp), delivery.shared]) list.sort((a,b)=>a.bytes-b.bytes);
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/runtime-asset-manifest.json'), JSON.stringify(delivery, null, 2) + '\n');
const report = {
  generatedAt: new Date().toISOString(),
  system: policy.system,
  assetCount: entries.length,
  totalBytes,
  duplicateGroups: duplicates.length,
  duplicateRedundantBytes: duplicates.reduce((n, d) => n + d.redundantBytes, 0),
  heavyCandidates: opportunities.length,
  entries,
  duplicates,
  opportunities,
  actions: {
    automaticSafe: [
      'Service worker runtime caching for 3D/audio/texture assets',
      'Exact duplicate detection and report',
      'Heavy asset detection',
      'Compression/streaming candidate classification',
      'Per-app idle warm manifest generation for safe small/medium runtime assets'
    ],
    gatedDestructive: [
      'Mesh simplification',
      'Texture downscaling',
      'Geometry decimation',
      'Source asset deletion'
    ]
  }
};
fs.writeFileSync(path.join(ROOT, 'ASSET_QUALITY_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`[ASSET_QUALITY] assets=${report.assetCount} heavy=${report.heavyCandidates} duplicateGroups=${report.duplicateGroups} totalMB=${(totalBytes / 1048576).toFixed(1)}`);
