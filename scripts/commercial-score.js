'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const readJSON = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

function getRubric(profile, standard) {
  const rubric = standard.profiles[profile];
  if (!rubric) throw new Error(`Unknown commercial profile: ${profile}`);
  const sum = Object.values(rubric.criteria).reduce((a,b)=>a+b,0);
  if (sum !== 100) throw new Error(`Rubric ${profile} weights must sum to 100, got ${sum}`);
  return rubric;
}

function scoreEntry(entry, standard) {
  const rubric = getRubric(entry.profile || 'surface', standard);
  let score = 0;
  const breakdown = {};
  for (const [key, weight] of Object.entries(rubric.criteria)) {
    const c = entry.criteria?.[key] || {};
    const normalized = Math.max(0, Math.min(1, Number(c.score || 0)));
    const hasEvidence = Array.isArray(c.evidence) && c.evidence.filter(Boolean).length > 0;
    const points = normalized * weight * (hasEvidence ? 1 : 0.5);
    score += points;
    breakdown[key] = {
      weight,
      declared: normalized,
      evidence: hasEvidence,
      points: Number(points.toFixed(2))
    };
  }
  return { score: Number(score.toFixed(2)), target: 100, breakdown };
}

function experimentById(id) {
  const registry = readJSON('data/home-experiments.json');
  const entry = registry.experiments[id];
  if (!entry) throw new Error(`Experiment not found: ${id}`);
  return entry;
}

if (require.main === module) {
  const id = process.argv[2];
  if (!id) {
    console.error('Usage: node scripts/commercial-score.js <experiment-id>');
    process.exit(2);
  }
  const standard = readJSON('data/commercial-standard.json');
  const result = scoreEntry(experimentById(id), standard);
  console.log(JSON.stringify({ id, ...result }, null, 2));
  // IMPORTANT: score never blocks a release.
  process.exit(0);
}

module.exports = { scoreEntry, getRubric };
