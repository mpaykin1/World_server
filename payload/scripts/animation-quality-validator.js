#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/animation-quality-contract.json'), 'utf8'));
const inputArg = process.argv.find(x => x.startsWith('--input='));
const input = inputArg ? inputArg.slice('--input='.length) : process.env.ANIMATION_TELEMETRY_JSON;
const requireTelemetry = process.argv.includes('--require');
const reportPath = path.join(ROOT, 'ANIMATION_QUALITY_REPORT.json');

function finish(report, code = 0) {
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[ANIMATION_QUALITY] ${report.status} score=${report.score ?? 0}`);
  process.exitCode = code;
}

if (!input || !fs.existsSync(path.resolve(ROOT, input))) {
  finish({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: 'NOT_VERIFIED',
    score: 0,
    reason: 'No animation telemetry supplied. Set ANIMATION_TELEMETRY_JSON or --input=<file>.',
    requiredProducer: 'runtime animation telemetry exporter'
  }, requireTelemetry ? 32 : 0);
} else {
  const data = JSON.parse(fs.readFileSync(path.resolve(ROOT, input), 'utf8'));
  const samples = Array.isArray(data.samples) ? data.samples : [];
  const dimensions = contract.dimensions;
  const totals = Object.fromEntries(Object.keys(dimensions).map(k => [k, { sum: 0, n: 0 }]));

  for (const sample of samples) {
    for (const key of Object.keys(dimensions)) {
      const v = Number(sample[key]);
      if (!Number.isFinite(v)) continue;
      totals[key].sum += Math.max(0, Math.min(1, v));
      totals[key].n++;
    }
  }

  let weightSum = 0;
  let weighted = 0;
  const scores = {};
  for (const [key, cfg] of Object.entries(dimensions)) {
    const avg = totals[key].n ? totals[key].sum / totals[key].n : 0;
    scores[key] = Math.round(avg * 100);
    weighted += avg * Number(cfg.weight || 0);
    weightSum += Number(cfg.weight || 0);
  }
  const score = weightSum ? Math.round(100 * weighted / weightSum) : 0;
  const status = samples.length ? (score >= contract.passScore ? 'PASS' : 'FAIL') : 'NOT_VERIFIED';
  finish({
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    score,
    passScore: contract.passScore,
    samples: samples.length,
    dimensions: scores
  }, requireTelemetry && status !== 'PASS' ? 32 : 0);
}
