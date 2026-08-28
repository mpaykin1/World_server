#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const patchRoot = __dirname;
const payload = path.join(patchRoot, 'payload');
const target = path.resolve(process.argv[2] || process.cwd());
const dryRun = process.argv.includes('--dry-run');
const reportPath = path.join(target, 'GS360_INSTALL_REPORT.json');

function ensureDir(p) { if (!dryRun) fs.mkdirSync(p, { recursive: true }); }
function copyTree(src, dst) {
  ensureDir(dst);
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else if (!dryRun) fs.copyFileSync(s, d);
  }
}
function atomicJson(file, obj) {
  if (dryRun) return;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

const report = {
  schema: 'world-server.gs360-install/v6',
  pass: false,
  target,
  dryRun,
  actions: [],
  safeguards: ['idempotent-copy', 'package-json-backup-before-change', 'no-existing-module-deletion', 'truthful-status-contract', 'checkpoint-resume', 'shared-benchmark-registry', 'quality-gate', 'backend-registry', 'persistent-job-queue', 'dead-letter-queue', 'artifact-audit', 'capture-coach', 'cpu-depth-registry', 'license-gate', 'input-quality-gate', 'next-action-planner', 'synthetic-consistency-gate', 'resume-fingerprint-invalidation', 'safe-splat-optimizer', 'spz-sog-lod-export']
};
try {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) throw new Error('Target directory does not exist: ' + target);
  const moduleDst = path.join(target, 'systems', 'gs360');
  copyTree(path.join(payload, 'systems', 'gs360'), moduleDst);
  report.actions.push({ action: 'install_or_update', path: 'systems/gs360' });

  const pkgPath = path.join(target, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const original = fs.readFileSync(pkgPath, 'utf8');
    const pkg = JSON.parse(original);
    pkg.scripts = pkg.scripts || {};
    const wanted = {
      'gs360': 'node systems/gs360/run.cjs',
      'gs360:setup': 'node systems/gs360/setup.cjs',
      'test:gs360': 'node systems/gs360/test.cjs',
      'gs360:resources': 'node systems/gs360/resource-advisor.cjs',
      'gs360:wait': 'node systems/gs360/wait-and-verify.cjs',
      'gs360:autopilot': 'node systems/gs360/autopilot.cjs',
      'gs360:health': 'node systems/gs360/health-check.cjs',
      'gs360:quality': 'node systems/gs360/quality.cjs',
      'gs360:backend': 'node systems/gs360/backend-registry.cjs',
      'gs360:depth': 'node systems/gs360/depth-registry.cjs',
      'gs360:license': 'node systems/gs360/license-gate.cjs',
      'gs360:next': 'node systems/gs360/next-action.cjs',
      'gs360:benchmark': 'node systems/gs360/resource-benchmark.cjs',
      'gs360:train': 'node systems/gs360/trainer-runner.cjs',
      'gs360:queue': 'node systems/gs360/job-queue.cjs',
      'gs360:system-test': 'node systems/gs360/system-test.cjs',
      'gs360:doctor': 'node systems/gs360/doctor.cjs',
      'gs360:storage': 'node systems/gs360/storage-manager.cjs',
      'gs360:optimize': 'node systems/gs360/splat-optimizer.cjs',
      'gs360:consistency': 'node systems/gs360/consistency.cjs'
    };
    let changed = false;
    for (const [k,v] of Object.entries(wanted)) {
      if (pkg.scripts[k] !== v) { pkg.scripts[k] = v; changed = true; }
    }
    if (changed && !dryRun) {
      const backup = pkgPath + '.pre-gs360-v6.bak';
      if (!fs.existsSync(backup)) fs.writeFileSync(backup, original, 'utf8');
      atomicJson(pkgPath, pkg);
    }
    report.actions.push({ action: changed ? 'patch_package_scripts' : 'package_scripts_already_current', path: 'package.json', scripts: wanted });
  } else {
    report.actions.push({ action: 'package_json_absent', note: 'Module is installed; run node systems/gs360/run.cjs directly.' });
  }

  if (!dryRun) {
    fs.copyFileSync(path.join(patchRoot, 'DESKTOP_AI_INSTRUCTIONS.md'), path.join(moduleDst, 'DESKTOP_AI_INSTRUCTIONS.md'));
    report.actions.push({ action: 'install_desktop_ai_instructions', path: 'systems/gs360/DESKTOP_AI_INSTRUCTIONS.md' });
  }
  report.pass = true;
  report.next = ['npm run gs360:setup', 'npm run test:gs360', 'npm run gs360:system-test', 'npm run gs360:health', 'npm run gs360:depth', 'npm run gs360:backend', 'npm run gs360:license', 'npm run gs360:resources', 'npm run gs360:optimize -- --output <output> --target spz'];
  atomicJson(reportPath, report);
  console.log('[GS360 CPU QUALITY V6 INSTALL] PASS');
  console.log(JSON.stringify(report, null, 2));
} catch (err) {
  report.error = String(err && err.stack || err);
  try { atomicJson(reportPath, report); } catch (_) {}
  console.error('[GS360 SMART AUTOPILOT INSTALL] FAIL:', err.message || err);
  process.exit(1);
}
