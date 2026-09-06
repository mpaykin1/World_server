'use strict';

const crypto = require('crypto');

const CONTRACT_VERSION = 'world-procedural-native-contract-v3';

function canonicalVoxelLines(voxels = []) {
  return voxels
    .map((v) => [Math.trunc(Number(v[0]) || 0), Math.trunc(Number(v[1]) || 0), Math.trunc(Number(v[2]) || 0), Math.trunc(Number(v[3]) || 0)])
    .sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1] || a[3] - b[3])
    .map((v) => `${v[0]},${v[1]},${v[2]},${v[3]}\n`)
    .join('');
}
function portableChunkSignature(voxels = []) {
  return crypto.createHash('sha256').update(canonicalVoxelLines(voxels), 'utf8').digest('hex');
}
function makeNativeContractReport(chunks = [], meta = {}) {
  return {
    contractVersion: CONTRACT_VERSION,
    engineVersion: meta.engineVersion || null,
    platform: meta.platform || 'node-reference',
    generatedAt: meta.generatedAt || null,
    chunks: chunks.map((chunk) => ({
      x: Number(chunk.chunk?.x ?? chunk.x) || 0,
      z: Number(chunk.chunk?.z ?? chunk.z) || 0,
      voxels: Array.isArray(chunk.voxels) ? chunk.voxels.length : Number(chunk.voxelCount) || 0,
      portableSignature: chunk.portableSignature || portableChunkSignature(chunk.voxels || [])
    }))
  };
}
function compareNativeReports(reference, nativeReport) {
  if (!reference || !nativeReport) throw new TypeError('reference and native report required');
  const expected = new Map((reference.chunks || []).map((c) => [`${c.x},${c.z}`, c]));
  const actual = new Map((nativeReport.chunks || []).map((c) => [`${c.x},${c.z}`, c]));
  const mismatches = [];
  for (const [key, e] of expected) {
    const a = actual.get(key);
    if (!a) { mismatches.push({ key, reason: 'missing-native-chunk' }); continue; }
    if (a.portableSignature !== e.portableSignature) mismatches.push({ key, reason: 'signature', expected: e.portableSignature, actual: a.portableSignature });
    if (Number(a.voxels) !== Number(e.voxels)) mismatches.push({ key, reason: 'voxel-count', expected: e.voxels, actual: a.voxels });
  }
  for (const key of actual.keys()) if (!expected.has(key)) mismatches.push({ key, reason: 'unexpected-native-chunk' });
  return { ok: mismatches.length === 0, checked: expected.size, mismatches };
}

module.exports = { CONTRACT_VERSION, canonicalVoxelLines, portableChunkSignature, makeNativeContractReport, compareNativeReports };
