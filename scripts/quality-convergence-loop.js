#!/usr/bin/env node
'use strict';

const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = process.cwd();
const FULL = process.argv.includes('--full');
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/quality-convergence-policy.json'), 'utf8'));

function exec(command, args = [], options = {}) {
  const r = cp.spawnSync(command, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 16 * 1024 * 1024
  });
  return { command: [command, ...args].join(' '), status: r.status ?? 1, stdout: r.stdout || '', stderr: r.stderr || '' };
}
function runNode(file, args = []) { return exec(process.execPath, [path.join(ROOT, 'scripts', file), ...args]); }
function runNpm(script) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  return exec(cmd, ['run', script]);
}
function gitState() {
  const r = exec('git', ['status', '--porcelain']);
  return crypto.createHash('sha256').update(r.stdout).digest('hex');
}
function fingerprint(results) {
  return crypto.createHash('sha256').update(JSON.stringify(results.map(r => ({ c: r.command, s: r.status, e: (r.stderr + r.stdout).slice(-4000) })))).digest('hex');
}
function tail(text) { return String(text || '').slice(-7000); }

const report = { generatedAt: new Date().toISOString(), full: FULL, rounds: [], status: 'RUNNING', unresolved: [] };
let previousFailureFingerprint = null;
let previousGitState = null;
let plateauRounds = 0;

function verifyRound() {
  const results = [];
  results.push(runNode('integrate-runtime-adapters.js', ['--apply']));
  results.push(runNode('runtime-integration-discovery.js'));
  results.push(runNode('asset-quality-pipeline.js'));
  results.push(runNode('cpu-asset-transcode.js'));
  results.push(runNode('check-pwa-system.js'));
  results.push(runNode('check-animation-quality-system.js'));
  results.push(runNpm('check'));
  if (FULL) { results.push(runNpm('release:gate')); if (process.env.QUALITY_BASE_URL || process.env.QUALITY_INCLUDE_IOS_EVIDENCE === '1') results.push(runNpm('quality:ios-evidence')); }
  return results;
}
function remediate() {
  const actions = [];
  actions.push(runNode('quality-autofix.js', ['--apply']));
  actions.push(runNode('integrate-runtime-adapters.js', ['--apply']));
  if (process.env.QUALITY_PATCH_MODEL_URL) {
    actions.push(runNode('quality-root-cause.js'));
    actions.push(runNode('quality-patch-tournament.js'));
    actions.push(runNode('quality-patch-synthesizer.js'));
    actions.push(runNode('apply-verified-quality-patch.js'));
  }
  return actions;
}

for (let round = 1; round <= Number(policy.maxRounds || 8); round++) {
  console.log(`\n[QUALITY_CONVERGENCE] round=${round}`);
  const results = verifyRound();
  const failed = results.filter(r => r.status !== 0);
  const roundRecord = {
    round,
    verification: results.map(r => ({ command: r.command, status: r.status, stdoutTail: tail(r.stdout), stderrTail: tail(r.stderr) })),
    failedCommands: failed.map(r => r.command)
  };
  report.rounds.push(roundRecord);
  if (!failed.length) {
    report.status = 'CLEAN';
    report.completedAt = new Date().toISOString();
    report.roundsUsed = round;
    fs.writeFileSync(path.join(ROOT, 'QUALITY_CONVERGENCE_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(`[QUALITY_CONVERGENCE] CLEAN round=${round}`);
    process.exit(0);
  }

  const failFp = fingerprint(failed);
  const beforeGit = gitState();
  const remediation = remediate();
  const afterGit = gitState();
  roundRecord.remediation = remediation.map(r => ({ command: r.command, status: r.status, stdoutTail: tail(r.stdout), stderrTail: tail(r.stderr) }));
  roundRecord.gitChanged = beforeGit !== afterGit;

  if (failFp === previousFailureFingerprint && afterGit === previousGitState) plateauRounds++;
  else plateauRounds = 0;
  previousFailureFingerprint = failFp;
  previousGitState = afterGit;

  if (plateauRounds >= Number(policy.maxPlateauRounds || 1)) {
    report.status = 'BLOCKED_UNRESOLVED';
    report.unresolved = failed.map(r => ({ command: r.command, status: r.status, stdoutTail: tail(r.stdout), stderrTail: tail(r.stderr) }));
    report.rule = 'Do not declare completion. Desktop AI must inspect unresolved failures, patch root cause, add regression coverage, and rerun until CLEAN.';
    fs.writeFileSync(path.join(ROOT, 'QUALITY_CONVERGENCE_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
    console.error('[QUALITY_CONVERGENCE] BLOCKED_UNRESOLVED — completion forbidden until repaired');
    process.exit(91);
  }
}

report.status = 'MAX_ROUNDS_UNRESOLVED';
report.rule = 'Do not declare completion. Continue manually/with AI from this report and rerun until CLEAN.';
fs.writeFileSync(path.join(ROOT, 'QUALITY_CONVERGENCE_REPORT.json'), JSON.stringify(report, null, 2) + '\n');
console.error('[QUALITY_CONVERGENCE] MAX_ROUNDS_UNRESOLVED — completion forbidden');
process.exit(92);
