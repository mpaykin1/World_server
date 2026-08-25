#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const PATCH = 'production-100-truth-gate-v1';
const HERE = __dirname;
const PAYLOAD = path.join(HERE, 'payload');

const expected = {
  'scripts/world-quality-analyzer.js': '898cac7894f724a595ae894406b21b0060056736',
  'scripts/world-quality-autopilot.js': '7db0d93a1a0310c91e88a518cb05aea2cef45165',
  '.github/workflows/world-quality-autopilot.yml': '09cea9a4b894927b5039a2b65351ed48c0c02808',
  'DESKTOP_AI_INSTALL_AND_VERIFY.md': '0a73bf6c67973588185123e36940b1072698755a'
};

const created = ['test/world-quality-truth-gate.test.js'];

function die(message, code = 1) {
  console.error(`[${PATCH}] ${message}`);
  process.exit(code);
}

function exec(command, args, options = {}) {
  console.log(`> ${command} ${args.join(' ')}`);
  return cp.execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    ...options
  });
}

function output(command, args) {
  return cp.execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function blobSha(buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto.createHash('sha1').update(Buffer.concat([header, buffer])).digest('hex');
}

function ensureRepo() {
  if (!fs.existsSync('package.json') || !fs.existsSync('scripts/world-quality-analyzer.js')) {
    die('Run this installer from the World_server repository root.', 10);
  }
}

function ensureCleanAndBranch() {
  const dirty = output('git', ['status', '--porcelain']);
  if (dirty) die(`Working tree is not clean:\n${dirty}`, 12);

  let branch = output('git', ['branch', '--show-current']);
  if (!branch) die('Detached HEAD is not supported.', 13);

  if (branch === 'master' || branch === 'main') {
    const target = 'ai/desktop/production-100-truth-gate-v1';
    exec('git', ['switch', '-c', target]);
    branch = target;
  }

  return branch;
}

function verifyBase() {
  for (const [rel, sha] of Object.entries(expected)) {
    if (!fs.existsSync(rel)) die(`Missing expected file: ${rel}`, 20);
    const actual = blobSha(fs.readFileSync(rel));
    if (actual !== sha) {
      die(
        `Base mismatch for ${rel}. Expected Git blob ${sha}, got ${actual}. ` +
        `Do not force-apply: adapt the patch to the newer source.`,
        21
      );
    }
  }

  for (const rel of created) {
    if (fs.existsSync(rel)) die(`Refusing to overwrite already-existing new file: ${rel}`, 22);
  }
}

function backupFiles() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join('.patch-backups', PATCH, stamp);
  for (const rel of Object.keys(expected)) {
    const dst = path.join(backupRoot, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(rel, dst);
  }
  return backupRoot;
}

function installFiles() {
  const targets = [...Object.keys(expected), ...created];
  for (const rel of targets) {
    const src = path.join(PAYLOAD, rel);
    const dst = path.join(process.cwd(), rel);
    if (!fs.existsSync(src)) die(`Patch payload missing: ${rel}`, 30);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    console.log(`[${PATCH}] installed ${rel}`);
  }
}

function rollback(backupRoot) {
  console.error(`[${PATCH}] rolling back source files`);
  for (const rel of Object.keys(expected)) {
    const src = path.join(backupRoot, rel);
    if (fs.existsSync(src)) fs.copyFileSync(src, rel);
  }
  for (const rel of created) {
    if (fs.existsSync(rel)) fs.unlinkSync(rel);
  }
}

function writeReport(report) {
  fs.writeFileSync(
    'PRODUCTION_100_TRUTH_GATE_INSTALL_REPORT.json',
    JSON.stringify(report, null, 2) + '\n'
  );
}

ensureRepo();
const branch = ensureCleanAndBranch();
verifyBase();
const backupRoot = backupFiles();

const report = {
  schemaVersion: '1.0.0',
  patch: PATCH,
  branch,
  startedAt: new Date().toISOString(),
  pass: false,
  tests: [],
  backupRoot
};

try {
  installFiles();

  exec(process.execPath, ['--check', 'scripts/world-quality-analyzer.js']);
  report.tests.push({ id: 'analyzer-syntax', pass: true });

  exec(process.execPath, ['--check', 'scripts/world-quality-autopilot.js']);
  report.tests.push({ id: 'autopilot-syntax', pass: true });

  exec(process.execPath, ['--test', 'test/world-quality-truth-gate.test.js']);
  report.tests.push({ id: 'truth-gate-unit-tests', pass: true });

  exec('npm', ['run', 'quality:world']);
  report.tests.push({ id: 'quality-world', pass: true });

  const status = JSON.parse(fs.readFileSync('WORLD_QUALITY_AUTOPILOT_STATUS.json', 'utf8'));
  if (status.production100Certified === true) {
    throw new Error(
      'Current repository unexpectedly certified 100%. ' +
      'Inspect evidence before continuing; do not accept a false positive.'
    );
  }
  if (!(Number(status.readinessPercent) < 100)) {
    throw new Error(`Expected truthful readiness below 100, got ${status.readinessPercent}`);
  }

  report.tests.push({
    id: 'current-false-100-blocked',
    pass: true,
    readinessPercent: status.readinessPercent,
    production100Certified: status.production100Certified,
    blockers: status.productionCertification?.blockers || []
  });

  report.pass = true;
  report.finishedAt = new Date().toISOString();
  writeReport(report);

  console.log(`[${PATCH}] PASS`);
  console.log(`[${PATCH}] branch: ${branch}`);
  console.log(`[${PATCH}] readiness: ${status.readinessPercent}%`);
  console.log(`[${PATCH}] production100Certified: ${status.production100Certified}`);
  console.log(`[${PATCH}] blockers: ${(status.productionCertification?.blockers || []).join(', ')}`);
  console.log(`[${PATCH}] Next: run npm run release:gate, full desktop/mobile tests, push PR, CI, merge, production smoke.`);
} catch (error) {
  report.error = String(error && error.stack || error);
  report.finishedAt = new Date().toISOString();
  writeReport(report);
  rollback(backupRoot);
  console.error(report.error);
  process.exit(40);
}
