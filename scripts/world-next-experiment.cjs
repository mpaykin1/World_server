#!/usr/bin/env node
'use strict';
// Knuth-style predeclared experiment. Predictions are NEVER promoted to
// measured improvements, and this file cannot mutate the game engine.
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');

function valid(x) {
  return x && typeof x.id === 'string' && typeof x.tier === 'string' &&
    Number.isFinite(x.predictedQuality) && Number.isFinite(x.predictedCost) &&
    Number.isFinite(x.detailRadius) && Number.isFinite(x.maxDpr);
}
function planNextExperiment(lab) {
  const all = (lab?.candidates || []).filter(valid);
  const baselines = new Map();
  for (const x of all) if (x.id === x.tier.toLowerCase() + '-0') baselines.set(x.tier, x);
  const eligible = [];
  for (const x of all) {
    const base = baselines.get(x.tier);
    if (!base || x.id === base.id) continue;
    const gain = x.predictedQuality - base.predictedQuality;
    const addedCost = x.predictedCost - base.predictedCost;
    if (gain <= 0 || x.predictedCost > base.predictedCost * 1.1) continue;
    eligible.push({
      id: x.id, tier: x.tier, baseline: base.id,
      predictedQualityGain: +gain.toFixed(2), predictedCostDelta: +addedCost.toFixed(2),
      hypothesisPriority: +(gain - Math.max(0, addedCost) * 0.7).toFixed(2),
      proposedSettings: { detailRadius: x.detailRadius, maxDpr: x.maxDpr },
      baselineSettings: { detailRadius: base.detailRadius, maxDpr: base.maxDpr }
    });
  }
  eligible.sort((a, b) => b.hypothesisPriority - a.hypothesisPriority || a.id.localeCompare(b.id));
  const candidate = eligible[0] || null;
  const inputSha256 = crypto.createHash('sha256').update(JSON.stringify(all)).digest('hex');
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), inputSha256,
    status: candidate ? 'PROPOSED_UNVERIFIED' : 'NO_VALID_EXPERIMENT',
    mutationAllowed: false, notYetProven: true, candidate,
    excludedReason: candidate ? null : 'No valid same-tier baseline or positive gain within 10% predicted cost budget',
    experiment: candidate ? {
      predeclaredHypothesis: 'For tier ' + candidate.tier + ', settings ' + candidate.id +
        ' improve perceived world detail versus unchanged ' + candidate.baseline +
        ' without reducing minimum acceptable frame rate or controls.',
      counterfactual: 'Run unchanged ' + candidate.baseline +
        ' under the same seed, viewport, hardware, camera path and scene.',
      requiredEvidence: [
        'Side-by-side visual baseline and independent reviewer on exact candidate SHA',
        'Median and p95 frame time on desktop and mobile; baseline versus candidate',
        'No regression in movement, collisions, jumping, animation or input latency',
        'A/B replay with a fixed world seed, stable scene and three repeated measurements',
        'Real-user visibility metric >= 85% BEFORE any test URL is advertised'
      ],
      rejectionRules: [
        'Reject if measured p95 frame time worsens more than 5%',
        'Reject if a Golden Standard behavior regresses or no paired device data exists',
        'Reject if independent review or CI is BLOCK or INCONCLUSIVE'
      ]
    } : null
  };
}
function main() {
  const root = process.cwd();
  const labPath = path.join(root, 'WORLD_CANDIDATE_LAB_REPORT.json');
  const lab = fs.existsSync(labPath) ? JSON.parse(fs.readFileSync(labPath, 'utf8')) : null;
  const plan = planNextExperiment(lab);
  fs.writeFileSync(path.join(root, 'WORLD_NEXT_EXPERIMENT_REPORT.json'), JSON.stringify(plan, null, 2) + '\n');
  console.log('[WORLD_NEXT_EXPERIMENT] ' + plan.status + (plan.candidate ? ' ' + plan.candidate.id : ''));
}
if (require.main === module) main();
module.exports = { planNextExperiment };
