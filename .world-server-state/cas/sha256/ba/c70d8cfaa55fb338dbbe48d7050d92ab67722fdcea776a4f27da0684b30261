'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function hashFile(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function refsFrom(text) {
  const refs = new Set();
  for (const rx of [/(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g, /require\(\s*["']([^"']+)["']\s*\)/g, /import\(\s*["']([^"']+)["']\s*\)/g]) {
    let m; while ((m = rx.exec(text))) refs.add(m[1]);
  }
  return [...refs];
}

function buildCodeGraph(project, maxBytes = 2 * 1024 * 1024) {
  const code = project.files.filter(f => /\.(js|mjs|cjs|ts|tsx|jsx)$/i.test(f) && fs.statSync(f).size <= maxBytes);
  const nodes = [];
  const hashes = new Map();
  for (const file of code) {
    const text = fs.readFileSync(file, 'utf8');
    const hash = hashFile(file);
    if (!hashes.has(hash)) hashes.set(hash, []);
    hashes.get(hash).push(file);
    nodes.push({ file, refs: refsFrom(text) });
  }
  const duplicateGroups = [...hashes.values()].filter(g => g.length > 1).map(g => g.map(f => path.relative(project.dir, f)));
  const score = Math.max(50, 100 - duplicateGroups.length * 10);
  return { score, nodeCount: nodes.length, edgeCount: nodes.reduce((n, x) => n + x.refs.length, 0), duplicateGroups, nodes };
}

module.exports = { buildCodeGraph };
