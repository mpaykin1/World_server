#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PATCH_ROOT = __dirname;
const target = path.resolve(process.argv[2] || process.cwd());
const protectedBranches = new Set(['master', 'main']);

function fail(message) {
  console.error(`[GAP_CLOSURE_INSTALL] ${message}`);
  process.exit(2);
}

function branch() {
  try {
    return cp.execFileSync('git', ['branch', '--show-current'], {
      cwd: target,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
  } catch { return ''; }
}

function copy(rel) {
  const src = path.join(PATCH_ROOT, rel);
  const dst = path.join(target, rel);
  if (!fs.existsSync(src)) fail(`patch file missing: ${rel}`);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log(`[GAP_CLOSURE_INSTALL] copied ${rel}`);
}

const pkgPath = path.join(target, 'package.json');
if (!fs.existsSync(pkgPath)) fail(`package.json not found in ${target}`);
const currentBranch = branch();
if (!currentBranch) fail('target must be a git repository with a checked-out branch');
if (protectedBranches.has(currentBranch)) {
  fail(`refusing direct install on protected branch ${currentBranch}; create ai/desktop/gap-closure-v1 first`);
}

for (const rel of [
  'scripts/gap-closure-engine.js',
  'data/gap-closure-policy.json',
  'test/gap-closure.test.js',
  '.github/workflows/gap-closure.yml',
  'supabase/migrations/20260824054000_gap_closure_system_v1.sql',
  'docs/DESKTOP_AI_GAP_CLOSURE.md'
]) copy(rel);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.scripts = pkg.scripts || {};
pkg.scripts['quality:gaps'] = 'node scripts/gap-closure-engine.js';
pkg.scripts['quality:gaps:apply'] = 'node scripts/gap-closure-engine.js --apply';
pkg.scripts['quality:gaps:gate'] = 'node scripts/gap-closure-engine.js --gate=release';
pkg.scripts['quality:gaps:perfect'] = 'node scripts/gap-closure-engine.js --gate=perfect';
if (typeof pkg.scripts['release:gate'] === 'string' && !pkg.scripts['release:gate'].includes('quality:gaps:gate')) {
  pkg.scripts['release:gate'] += ' && npm run quality:gaps:gate';
}
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('[GAP_CLOSURE_INSTALL] package.json updated');

cp.execFileSync(process.execPath, ['--test', 'test/gap-closure.test.js'], { cwd: target, stdio: 'inherit' });
cp.execFileSync(process.execPath, ['scripts/gap-closure-engine.js'], { cwd: target, stdio: 'inherit' });

console.log('[GAP_CLOSURE_INSTALL] installed and smoke-tested');
console.log('[GAP_CLOSURE_INSTALL] next: run canonical reviewers, then npm run quality:gaps:apply on this non-protected branch');
