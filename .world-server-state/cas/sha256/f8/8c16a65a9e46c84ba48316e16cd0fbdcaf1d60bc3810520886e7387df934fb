'use strict';

const fs = require('node:fs');
const path = require('node:path');

const IMAGE = /\.(png|jpg|jpeg|webp|avif|gif|ktx2|basis)$/i;
const MODEL = /\.(glb|gltf|obj|fbx|dae|ply|spz)$/i;
const SCRIPT = /\.(js|mjs|cjs|ts|tsx|jsx|wasm)$/i;

function summarizeAssets(files) {
  const s = { totalBytes: 0, imageBytes: 0, modelBytes: 0, scriptBytes: 0, imageCount: 0, modelCount: 0, scriptCount: 0, largestFileBytes: 0 };
  for (const file of files.filter(fs.existsSync)) {
    const size = fs.statSync(file).size;
    s.totalBytes += size;
    s.largestFileBytes = Math.max(s.largestFileBytes, size);
    if (IMAGE.test(file)) { s.imageCount++; s.imageBytes += size; }
    if (MODEL.test(file)) { s.modelCount++; s.modelBytes += size; }
    if (SCRIPT.test(file)) { s.scriptCount++; s.scriptBytes += size; }
  }
  return s;
}

function evaluateDeviceBudgets(summary, tiers = {}) {
  return Object.entries(tiers).map(([tier, limits]) => {
    const failures = [];
    for (const [key, max] of Object.entries(limits || {})) {
      if (Number.isFinite(max) && Number(summary[key]) > max) failures.push({ metric: key, value: summary[key], max });
    }
    return { tier, ok: failures.length === 0, failures };
  });
}

function performanceScore(summary, tiers) {
  const checks = evaluateDeviceBudgets(summary, tiers);
  if (!checks.length) return { score: 100, checks };
  const pass = checks.filter(c => c.ok).length;
  return { score: Math.round(55 + 45 * (pass / checks.length)), checks };
}

module.exports = { evaluateDeviceBudgets, performanceScore, summarizeAssets };
