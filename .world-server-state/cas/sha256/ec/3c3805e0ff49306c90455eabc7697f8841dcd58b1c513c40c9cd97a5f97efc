'use strict';

const fs = require('node:fs');

const DEFAULT_RULES = {
  fpsP50: { direction: 'higher', maxRelativeRegression: 0.05, hardMin: 30 },
  fpsP95: { direction: 'higher', maxRelativeRegression: 0.08, hardMin: 20 },
  crashRate: { direction: 'lower', maxAbsoluteRegression: 0.001, hardMax: 0.02 },
  errorRate: { direction: 'lower', maxRelativeRegression: 0.10, hardMax: 0.05 },
  p95LatencyMs: { direction: 'lower', maxRelativeRegression: 0.12, hardMax: 2500 },
  memoryMb: { direction: 'lower', maxRelativeRegression: 0.15, hardMax: 2048 },
  webglContextLossRate: { direction: 'lower', maxAbsoluteRegression: 0.001, hardMax: 0.01 }
};

function finite(v) { return Number.isFinite(Number(v)) ? Number(v) : null; }

function evaluateMetric(name, baselineValue, currentValue, rule) {
  const baseline = finite(baselineValue);
  const current = finite(currentValue);
  if (current === null) return { name, status: 'missing', ok: false, baseline, current, reason: 'missing-current' };
  const direction = rule.direction || 'lower';
  const failures = [];

  if (rule.hardMin != null && current < rule.hardMin) failures.push(`below-hard-min:${rule.hardMin}`);
  if (rule.hardMax != null && current > rule.hardMax) failures.push(`above-hard-max:${rule.hardMax}`);

  if (baseline !== null) {
    if (rule.maxAbsoluteRegression != null) {
      const regression = direction === 'higher' ? baseline - current : current - baseline;
      if (regression > rule.maxAbsoluteRegression) failures.push(`absolute-regression:${regression}`);
    }
    if (rule.maxRelativeRegression != null && Math.abs(baseline) > 1e-9) {
      const regression = direction === 'higher' ? (baseline - current) / Math.abs(baseline) : (current - baseline) / Math.abs(baseline);
      if (regression > rule.maxRelativeRegression) failures.push(`relative-regression:${regression.toFixed(4)}`);
    }
  }
  return { name, status: failures.length ? 'regressed' : 'pass', ok: failures.length === 0, baseline, current, failures };
}

function evaluateTelemetry(baseline = {}, current = {}, rules = DEFAULT_RULES) {
  const checks = Object.entries(rules).map(([name, rule]) => evaluateMetric(name, baseline[name], current[name], rule));
  const required = checks.filter(c => c.current !== null);
  const failed = required.filter(c => !c.ok);
  return {
    ok: required.length > 0 && failed.length === 0,
    status: required.length === 0 ? 'no-data' : failed.length ? 'rollback' : 'promote',
    checks,
    failed: failed.map(c => c.name),
    coverage: checks.length ? Math.round((required.length / checks.length) * 100) : 0
  };
}

function readTelemetry(file) {
  if (!file || !fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.metrics || raw;
}

module.exports = { DEFAULT_RULES, evaluateMetric, evaluateTelemetry, readTelemetry };
