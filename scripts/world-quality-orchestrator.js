#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = process.cwd();
const REPORT = path.join(ROOT, 'WORLD_QUALITY_ORCHESTRATOR_REPORT.json');
const EXTENDED = process.argv.includes('--extended');
const APPLY_SAFE_FIXES = process.argv.includes('--apply-safe-fixes');
const TIMEOUT = Number(process.env.QUALITY_STEP_TIMEOUT_MS || 180000);

const phases = [
  { id: 'runtime-proof', command: ['npm', ['run', 'runtime:proof']], hard: true },
  { id: 'static-unit', command: ['npm', ['run', 'check']], hard: true },
  { id: 'golden', command: ['npm', ['run', 'golden:check']], hard: true },
  { id: 'regression', command: ['npm', ['run', 'quality:regression']], hard: true },
  { id: 'impact', command: ['npm', ['run', 'quality:impact']], hard: true },
  { id: 'perceptual', command: ['npm', ['run', 'quality:perceptual']], hard: true },
  { id: 'stability', command: ['npm', ['run', 'quality:stability']], hard: true },
  { id: 'root-cause', command: ['npm', ['run', 'quality:root-cause']], hard: false },
  { id: 'autofix-plan', command: ['npm', ['run', 'quality:autofix:plan']], hard: false },
  { id: 'master-report', command: ['npm', ['run', 'quality:master-report']], hard: false },
  { id: 'motion-contract', command: ['npm', ['run', 'quality:motion']], hard: false },
  { id: 'animation-contract', command: ['npm', ['run', 'quality:animation']], hard: false },
  { id: 'performance-budget', command: ['npm', ['run', 'quality:performance-budget']], hard: false },
  { id: 'canary-rollback', command: ['npm', ['run', 'quality:canary-rollback']], hard: false }
];

if (APPLY_SAFE_FIXES) phases.push(
  { id: 'autofix-apply', command: ['npm', ['run', 'quality:autofix']], hard: true },
  { id: 'post-fix-static-unit', command: ['npm', ['run', 'check']], hard: true },
  { id: 'post-fix-runtime-proof', command: ['npm', ['run', 'runtime:proof']], hard: true },
  { id: 'post-fix-regression', command: ['npm', ['run', 'quality:regression']], hard: true }
);

if (EXTENDED) phases.push(
  { id: 'ai-gameplay-agent', command: ['npm', ['run', 'quality:dream-agent']], hard: false },
  { id: 'physics-guardian', command: ['npm', ['run', 'quality:physics-guardian']], hard: false },
  { id: 'performance-capture', command: ['npm', ['run', 'quality:performance:capture']], hard: false },
  { id: 'runtime-telemetry', command: ['npm', ['run', 'quality:telemetry']], hard: false },
  { id: 'network-chaos', command: ['npm', ['run', 'quality:chaos']], hard: false },
  { id: 'multiplayer-swarm', command: ['npm', ['run', 'quality:swarm']], hard: false },
  { id: 'cv-player', command: ['npm', ['run', 'quality:cv-player']], hard: false },
  { id: 'device-farm', command: ['npm', ['run', 'quality:device-farm']], hard: false },
  { id: 'roblox-bridge', command: ['npm', ['run', 'quality:roblox-bridge']], hard: false },
  { id: 'godot-runtime', command: ['npm', ['run', 'quality:godot-runtime']], hard: false },
  { id: 'real-devices', command: ['npm', ['run', 'quality:real-devices']], hard: false }
);

function runPhase(phase) {
  const [bin, args] = phase.command;
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const executable = process.platform === 'win32' && bin === 'npm' ? 'npm.cmd' : bin;
  const r = cp.spawnSync(executable, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: TIMEOUT,
    maxBuffer: 8 * 1024 * 1024
  });
  const durationMs = Date.now() - started;
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const ok = r.status === 0 && !timedOut;
  const result = {
    id: phase.id,
    hard: phase.hard,
    startedAt,
    durationMs,
    status: ok ? 'PASS' : 'FAIL',
    exitCode: r.status,
    signal: r.signal || null,
    timedOut,
    stdoutTail: String(r.stdout || '').slice(-5000),
    stderrTail: String(r.stderr || '').slice(-5000),
    error: r.error ? String(r.error.message || r.error) : null
  };
  console.log(`[WORLD_QUALITY] ${phase.id} ${result.status} ${durationMs}ms`);
  return result;
}

const results = phases.map(runPhase);
const hardFailures = results.filter(r => r.hard && r.status !== 'PASS');
const softFailures = results.filter(r => !r.hard && r.status !== 'PASS');

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: APPLY_SAFE_FIXES ? 'self-heal-safe' : EXTENDED ? 'extended' : 'certify',
  status: hardFailures.length ? 'FAIL' : 'PASS',
  hardFailures: hardFailures.map(x => x.id),
  softFailures: softFailures.map(x => x.id),
  phases: results
};
fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);

const dream = cp.spawnSync(process.execPath, [path.join(ROOT, 'scripts/dream-readiness.js')], {
  cwd: ROOT, stdio: 'inherit', env: process.env, timeout: TIMEOUT
});
if (dream.status !== 0 && !hardFailures.length) hardFailures.push({ id: 'dream-readiness' });

console.log(`[WORLD_QUALITY] ${report.status} hardFailures=${hardFailures.length} softFailures=${softFailures.length}`);
if (hardFailures.length) process.exitCode = 22;
