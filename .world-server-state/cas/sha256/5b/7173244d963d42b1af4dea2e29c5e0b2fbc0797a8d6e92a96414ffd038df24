#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/performance-budgets.json'), 'utf8'));
const file = process.env.PERFORMANCE_TELEMETRY_JSON || path.join(ROOT, 'PERFORMANCE_TELEMETRY.json');
const requireTelemetry = process.argv.includes('--require');
const outPath = path.join(ROOT, 'PERFORMANCE_BUDGET_REPORT.json');

function done(report, code=0) {
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`[PERFORMANCE_BUDGET] ${report.status} score=${report.score ?? 0}`);
  process.exitCode = code;
}

if (!fs.existsSync(file)) {
  done({ schemaVersion:1, generatedAt:new Date().toISOString(), status:'NOT_VERIFIED', score:0, reason:'performance telemetry missing' }, requireTelemetry ? 42 : 0);
} else {
  const t = JSON.parse(fs.readFileSync(file, 'utf8'));
  const checks = [
    ['medianFps', Number(t.fps?.median || 0) >= cfg.minMedianFps, t.fps?.median, `>=${cfg.minMedianFps}`],
    ['p95FrameMs', Number(t.frameMs?.p95 || Infinity) <= cfg.maxP95FrameMs, t.frameMs?.p95, `<=${cfg.maxP95FrameMs}`],
    ['startupMs', Number(t.startupMs || 0) <= cfg.maxStartupMs, t.startupMs, `<=${cfg.maxStartupMs}`],
    ['drawCalls', Number(t.renderer?.drawCalls || 0) <= cfg.maxDrawCalls, t.renderer?.drawCalls, `<=${cfg.maxDrawCalls}`],
    ['triangles', Number(t.renderer?.triangles || 0) <= cfg.maxTriangles, t.renderer?.triangles, `<=${cfg.maxTriangles}`]
  ].map(([name, ok, actual, expected]) => ({name, ok:Boolean(ok), actual, expected}));
  const passed = checks.filter(x => x.ok).length;
  const score = Math.round(100 * passed / checks.length);
  const status = passed === checks.length ? 'PASS' : 'FAIL';
  done({ schemaVersion:1, generatedAt:new Date().toISOString(), status, score, checks }, status === 'FAIL' && requireTelemetry ? 42 : 0);
}
