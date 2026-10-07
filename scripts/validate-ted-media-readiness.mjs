import fs from 'node:fs';

const contractPath = new URL('../.ai/ted-media-readiness.json', import.meta.url);
const statePath = new URL('../data/ted-media-readiness.json', import.meta.url);

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

const fail = (message) => {
  console.error('TED_MEDIA_READINESS_INVALID:', message);
  process.exitCode = 1;
};

const weights = new Map(contract.systems.map((system) => [system.id, Number(system.weight)]));
const weightTotal = [...weights.values()].reduce((sum, value) => sum + value, 0);
if (weightTotal !== 100) fail(`weights must sum to 100, got ${weightTotal}`);

if (state.metricId !== contract.metricId) {
  fail(`metricId mismatch: ${state.metricId} !== ${contract.metricId}`);
}

const seen = new Set();
let weighted = 0;

for (const system of state.systems) {
  if (seen.has(system.id)) fail(`duplicate system id: ${system.id}`);
  seen.add(system.id);

  if (!weights.has(system.id)) {
    fail(`unknown system id in state: ${system.id}`);
    continue;
  }

  const readiness = Number(system.readinessPercent);
  if (!Number.isFinite(readiness) || readiness < 0 || readiness > 100) {
    fail(`readiness out of range for ${system.id}: ${system.readinessPercent}`);
    continue;
  }

  if (readiness > 0 && (!Array.isArray(system.evidence) || system.evidence.length === 0)) {
    fail(`positive readiness requires evidence for ${system.id}`);
  }

  weighted += weights.get(system.id) * readiness / 100;
}

for (const id of weights.keys()) {
  if (!seen.has(id)) fail(`missing system in state: ${id}`);
}

const score = Number(weighted.toFixed(contract.scorePrecision ?? 1));
const expected = Number(state.scorePercent);
if (!Number.isFinite(expected) || Math.abs(score - expected) > 0.05) {
  fail(`stored score ${state.scorePercent} does not match computed score ${score}`);
}

const rounded = Math.round(score);
if (Number(state.roundedReportPercent) !== rounded) {
  fail(`roundedReportPercent ${state.roundedReportPercent} does not match ${rounded}`);
}

if (!process.exitCode) {
  console.log(`${contract.reportLabelRu} — ${rounded}%`);
  console.log(`TED_MEDIA_READINESS_EXACT=${score}`);
  console.log(`BASELINE_SHA=${state.baselineMasterSha}`);
}
