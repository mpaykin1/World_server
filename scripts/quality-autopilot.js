#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { runAutopilot } = require('../lib/quality-autopilot');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

const mode = arg('--mode', 'observe');
const reportPath = arg('--report', null);
const verify = process.argv.includes('--verify');
const noState = process.argv.includes('--no-state');
const noWip = process.argv.includes('--no-wip');
const compileRegressions = process.argv.includes('--compile-regressions');
const noAudit = process.argv.includes('--no-audit');

const run = runAutopilot({
  repoRoot: process.cwd(),
  mode,
  verify,
  reportPath: reportPath ? path.resolve(reportPath) : null,
  writeState: !noState,
  writeWip: !noWip,
  compileRegressions,
  writeAudit: !noAudit
});

console.log(`[QUALITY_AUTOPILOT] version=${run.version} mode=${run.mode}`);
console.log(`[QUALITY_AUTOPILOT] scanned=${run.summary.scanned} improved=${run.summary.improved}`);
console.log(`[QUALITY_AUTOPILOT] score=${run.summary.averageBefore}% -> ${run.summary.averageAfter}%`);
console.log(`[QUALITY_AUTOPILOT] accepted=${run.summary.acceptedFixes} rejected=${run.summary.rejectedFixes} telemetryCoverage=${run.summary.telemetryCoverage}%`);
for (const p of run.projects) {
  console.log(`[PROJECT] ${p.projectId}: ${p.before.score}% -> ${p.after.score}% engine=${p.engine.engine} weakest=${p.weakest} target=${p.target}% accepted=${p.acceptedFixes.length} tournament=${p.tournament?.winner || 'none'}`);
}
if (run.verification.some(v => !v.ok)) {
  console.error('[QUALITY_AUTOPILOT] verification failed; all candidate source changes were rolled back');
  process.exitCode = 2;
}
